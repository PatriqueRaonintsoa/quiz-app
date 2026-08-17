
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import { pool, q } from "./db.js";
import {
  getState,
  removeSession,
  sortedPlayers,
  publicView,
  juryView,
  playerView,
  currentBuzzerHolder,
} from "./gameState.js";

dotenv.config();

const corsOrigins = (process.env.CORS_ORIGIN || "*").split(",").map(o => o.trim());


const app = express();
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
      cors: { origin: corsOrigins },
});

// ---------------------------------------------------------------------------
// REST : Sessions
// ---------------------------------------------------------------------------

app.get("/api/sessions", async (req, res) => {
  const rows = await q(
    "SELECT id, name, status, created_at FROM sessions ORDER BY created_at DESC"
  );
  res.json(rows);
});

app.get("/api/sessions/:id", async (req, res) => {
  const rows = await q(
    "SELECT id, name, status FROM sessions WHERE id = :id",
    { id: req.params.id }
  );
  if (!rows.length) return res.status(404).json({ error: "Session introuvable" });
  res.json(rows[0]);
});

// Détail des questions posées pendant la session (bonne réponse + joueur(s)
// qui l'a/l'ont trouvée), pour la page de résultats. Uniquement disponible
// une fois la session terminée, pour ne jamais divulguer les réponses avant.
app.get("/api/sessions/:id/results-detail", async (req, res) => {
  const sessionId = req.params.id;
  const sessionRows = await q("SELECT status FROM sessions WHERE id = :id", { id: sessionId });
  if (!sessionRows.length) return res.status(404).json({ error: "Session introuvable" });
  if (sessionRows[0].status !== "ended") {
    return res.status(403).json({ error: "Le détail n'est disponible qu'une fois la session terminée." });
  }

  const questions = await q(
    `SELECT id, type, text, answer_text AS answerText, options, correct_options AS correctOptions, points
     FROM questions WHERE session_id = :sid AND used = TRUE ORDER BY activated_at, created_at`,
    { sid: sessionId }
  );

  const winnerRows = await q(
    `SELECT a.question_id AS questionId, p.name AS playerName, a.points_earned AS pointsEarned
     FROM answers a
     JOIN players p ON p.id = a.player_id
     JOIN questions qs ON qs.id = a.question_id
     WHERE qs.session_id = :sid AND a.is_correct = TRUE
     ORDER BY a.answered_at`,
    { sid: sessionId }
  );

  const winnersByQuestion = {};
  for (const w of winnerRows) {
    if (!winnersByQuestion[w.questionId]) winnersByQuestion[w.questionId] = [];
    winnersByQuestion[w.questionId].push({ name: w.playerName, points: w.pointsEarned });
  }

  const detail = questions.map((qr) => ({
    id: qr.id,
    type: qr.type,
    text: qr.text,
    answerText: qr.answerText || null,
    options: qr.options || null,
    correctOptions: qr.correctOptions || null,
    points: qr.points,
    winners: winnersByQuestion[qr.id] || [],
  }));

  res.json(detail);
});

app.post("/api/sessions", async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: "Nom et code requis" });
  try {
    const result = await pool.execute(
      "INSERT INTO sessions (name, code) VALUES (:name, :code)",
      { name, code }
    );
    const id = result[0].insertId;
    res.json({ id, name, status: "waiting" });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Ce code de session est déjà utilisé" });
    }
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/sessions/:id/verify-code", async (req, res) => {
  const { code } = req.body;
  const rows = await q("SELECT code FROM sessions WHERE id = :id", { id: req.params.id });
  if (!rows.length) return res.status(404).json({ ok: false });
  res.json({ ok: rows[0].code === code });
});

// ---------------------------------------------------------------------------
// REST : Joueurs
// ---------------------------------------------------------------------------

app.get("/api/sessions/:id/players/:deviceId", async (req, res) => {
  const rows = await q(
    "SELECT id, name, score FROM players WHERE session_id = :sid AND device_id = :did",
    { sid: req.params.id, did: req.params.deviceId }
  );
  if (!rows.length) return res.status(404).json({ error: "Aucun joueur" });
  res.json(rows[0]);
});

app.post("/api/sessions/:id/players", async (req, res) => {
  const { name, deviceId } = req.body;
  const sessionId = req.params.id;
  if (!name || !deviceId) return res.status(400).json({ error: "Nom et deviceId requis" });

  const existing = await q(
    "SELECT id, name, score FROM players WHERE session_id = :sid AND device_id = :did",
    { sid: sessionId, did: deviceId }
  );
  if (existing.length) return res.json(existing[0]);

  const result = await pool.execute(
    "INSERT INTO players (session_id, device_id, name, score) VALUES (:sid, :did, :name, 0)",
    { sid: sessionId, did: deviceId, name }
  );
  const player = { id: result[0].insertId, name, score: 0 };

  const state = getState(Number(sessionId));
  state.players.set(deviceId, { ...player, socketId: null, connected: false });
  broadcastState(Number(sessionId));

  res.json(player);
});

// ---------------------------------------------------------------------------
// REST : Banque de questions QCM (jury uniquement, protégé par code)
// ---------------------------------------------------------------------------

async function requireJuryCode(req, res) {
  const code = req.query.code || req.body.code;
  const rows = await q("SELECT code FROM sessions WHERE id = :id", { id: req.params.id });
  if (!rows.length || rows[0].code !== code) {
    res.status(403).json({ error: "Code jury invalide" });
    return false;
  }
  return true;
}

app.get("/api/sessions/:id/questions", async (req, res) => {
  if (!(await requireJuryCode(req, res))) return;
  const rows = await q(
    "SELECT id, type, text, answer_text AS answerText, options, correct_options, multiple, points, used, status FROM questions WHERE session_id = :sid ORDER BY created_at",
    { sid: req.params.id }
  );
  res.json(rows);
});

app.post("/api/sessions/:id/questions", async (req, res) => {
  if (!(await requireJuryCode(req, res))) return;
  const { type, text, answerText, options, correctOptions, multiple, points } = req.body;
  const result = await pool.execute(
    `INSERT INTO questions (session_id, type, text, answer_text, options, correct_options, multiple, points)
     VALUES (:sid, :type, :text, :answerText, :options, :correctOptions, :multiple, :points)`,
    {
      sid: req.params.id,
      type,
      text,
      answerText: answerText || null,
      options: options ? JSON.stringify(options) : null,
      correctOptions: correctOptions ? JSON.stringify(correctOptions) : null,
      multiple: !!multiple,
      points: points || 100,
    }
  );
  res.json({ id: result[0].insertId });
});

app.delete("/api/sessions/:id/questions/:qid", async (req, res) => {
  if (!(await requireJuryCode(req, res))) return;
  await pool.execute("DELETE FROM questions WHERE id = :qid AND session_id = :sid", {
    qid: req.params.qid,
    sid: req.params.id,
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Socket.io : temps réel
// ---------------------------------------------------------------------------

// mysql2 parse automatiquement les colonnes JSON en tableaux/objets JS.
// Ce helper gère aussi bien une valeur déjà parsée qu'une chaîne brute (robustesse).
function parseJsonColumn(value, fallback = []) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value; // déjà un objet/tableau
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function room(sessionId) {
  return `session:${sessionId}`;
}

const PAUSED_ERROR = "La session est en pause. Reprenez-la avant de piloter une question.";

async function getSessionRow(sessionId) {
  const rows = await q("SELECT * FROM sessions WHERE id = :id", { id: sessionId });
  return rows[0] || null;
}

function toEpoch(value) {
  return value ? new Date(value).getTime() : null;
}

async function broadcastState(sessionId) {
  const state = getState(sessionId);
  const sessionRow = await getSessionRow(sessionId);
  if (!sessionRow) return;
  const timer = {
    startedAt: toEpoch(sessionRow.started_at),
    endedAt: toEpoch(sessionRow.ended_at),
    pausedAt: toEpoch(sessionRow.paused_at),
    pausedDurationMs: sessionRow.paused_duration_ms || 0,
  };
  const sockets = await io.in(room(sessionId)).fetchSockets();
  for (const s of sockets) {
    const role = s.data.role;
    let payload;
    if (role === "jury") {
      payload = juryView(state, sessionRow.name);
    } else if (role === "player") {
      payload = playerView(state, sessionRow.name, s.data.deviceId);
    } else {
      payload = publicView(state, sessionRow.name);
    }
    s.emit("session:state", { ...payload, timer });
  }
}

function isJury(socket) {
  return socket.data.role === "jury";
}

// Enveloppe chaque handler socket : si une erreur survient (ex: requête SQL
// invalide, colonne manquante après une mise à jour non migrée...), on la
// logue et on prévient le client au lieu de faire planter tout le serveur
// Node (un rejet de promesse non attrapé arrête sinon tout le process).
function safeHandler(socket, label, fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(`[socket:${label}] erreur:`, err);
      socket.emit("error", {
        message: "Une erreur serveur est survenue. Réessayez, ou contactez l'organisateur.",
      });
    }
  };
}

// N'envoie l'événement (ex: son du buzzer) qu'au(x) socket(s) du jury de la
// session, afin de centraliser le son sur le poste du jury.
async function emitToJury(sessionId, event, payload) {
  const sockets = await io.in(room(sessionId)).fetchSockets();
  for (const s of sockets) {
    if (s.data.role === "jury") s.emit(event, payload);
  }
}

io.on("connection", (socket) => {
  socket.on("join", safeHandler(socket, "join", async ({ sessionId, role, code, deviceId }) => {
    sessionId = Number(sessionId);
    const sessionRow = await getSessionRow(sessionId);
    if (!sessionRow) return socket.emit("error", { message: "Session introuvable" });

    if (role === "jury" && sessionRow.code !== code) {
      return socket.emit("error", { message: "Code jury invalide" });
    }

    socket.join(room(sessionId));
    socket.data.sessionId = sessionId;
    socket.data.role = role;
    socket.data.deviceId = deviceId;

    const state = getState(sessionId);
    state.status = sessionRow.status;

    if (role === "player" && deviceId) {
      const rows = await q(
        "SELECT id, name, score FROM players WHERE session_id = :sid AND device_id = :did",
        { sid: sessionId, did: deviceId }
      );
      if (rows.length) {
        state.players.set(deviceId, {
          ...rows[0],
          socketId: socket.id,
          connected: true,
        });
      }
    }

    await broadcastState(sessionId);
  }));

  // Retire un joueur non désiré de la session (ex: connecté par erreur).
  // Son device n'apparaît plus comme inscrit : sur son écran, la vue passera
  // à "me: null" au prochain état, ce qui le renvoie automatiquement vers la
  // page de session (comportement déjà existant côté joueur).
  socket.on("player:remove", safeHandler(socket, "player:remove", async ({ playerId }) => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    for (const [deviceId, p] of state.players.entries()) {
      if (p.id === playerId) {
        state.players.delete(deviceId);
        break;
      }
    }
    await pool.execute("DELETE FROM players WHERE id=:id AND session_id=:sid", {
      id: playerId,
      sid: sessionId,
    });
    await broadcastState(sessionId);
  }));

  socket.on("session:start", safeHandler(socket, "session:start", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const countRows = await q("SELECT COUNT(*) AS cnt FROM questions WHERE session_id=:id", {
      id: sessionId,
    });
    if (!countRows.length || !countRows[0].cnt) {
      return socket.emit("error", {
        message: "Ajoutez au moins une question à la banque avant de démarrer la session.",
      });
    }
    const state0 = getState(sessionId);
    if (state0.players.size < 2) {
      return socket.emit("error", {
        message: "Il faut au moins deux joueurs connectés pour démarrer la session.",
      });
    }
    await pool.execute("UPDATE sessions SET status='started', started_at=NOW() WHERE id=:id", {
      id: sessionId,
    });
    getState(sessionId).status = "started";
    await broadcastState(sessionId);
  }));

  socket.on("session:pause", safeHandler(socket, "session:pause", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const sessionRow = await getSessionRow(sessionId);
    if (!sessionRow || sessionRow.status !== "started") return;
    await pool.execute("UPDATE sessions SET status='paused', paused_at=NOW() WHERE id=:id", {
      id: sessionId,
    });
    getState(sessionId).status = "paused";
    await broadcastState(sessionId);
  }));

  socket.on("session:resume", safeHandler(socket, "session:resume", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const sessionRow = await getSessionRow(sessionId);
    if (!sessionRow || sessionRow.status !== "paused") return;
    const pausedMs = sessionRow.paused_at ? Date.now() - new Date(sessionRow.paused_at).getTime() : 0;
    await pool.execute(
      "UPDATE sessions SET status='started', paused_duration_ms = paused_duration_ms + :pausedMs, paused_at=NULL WHERE id=:id",
      { id: sessionId, pausedMs }
    );
    getState(sessionId).status = "started";
    await broadcastState(sessionId);
  }));

  socket.on("session:end", safeHandler(socket, "session:end", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const sessionRow = await getSessionRow(sessionId);
    // Si la session était en pause au moment de la clôture, on comptabilise
    // ce dernier segment de pause avant de figer le minuteur.
    const extraPausedMs =
      sessionRow?.status === "paused" && sessionRow.paused_at
        ? Date.now() - new Date(sessionRow.paused_at).getTime()
        : 0;
    await pool.execute(
      "UPDATE sessions SET status='ended', ended_at=NOW(), paused_duration_ms = paused_duration_ms + :extraPausedMs, paused_at=NULL WHERE id=:id",
      { id: sessionId, extraPausedMs }
    );
    const state = getState(sessionId);
    state.status = "ended";
    state.currentQuestion = null;
    await broadcastState(sessionId);
  }));

  // Sélectionne une question "ouverte" (buzzer) de la banque comme question
  // courante, visible du seul jury (avec le texte) tant que le buzzer n'est
  // pas ouvert aux joueurs.
  socket.on("question:buzzer:select", safeHandler(socket, "question:buzzer:select", async ({ questionId }) => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    if (getState(sessionId).status === "paused") {
      return socket.emit("error", { message: PAUSED_ERROR });
    }
    const rows = await q(
      "SELECT * FROM questions WHERE id=:id AND session_id=:sid AND type='buzzer'",
      { id: questionId, sid: sessionId }
    );
    if (!rows.length) return;
    const qrow = rows[0];
    const state = getState(sessionId);
    state.currentQuestion = {
      id: qrow.id,
      type: "buzzer",
      text: qrow.text,
      answerText: qrow.answer_text || null,
      points: qrow.points,
      status: "draft",
      buzzerQueue: [],
    };
    // Dès la sélection (avant même l'ouverture du buzzer aux joueurs), la
    // question bascule dans "Déjà utilisées" côté banque.
    await pool.execute("UPDATE questions SET used=TRUE WHERE id=:id", { id: qrow.id });
    await emitToJury(sessionId, "bank:updated", {});
    await broadcastState(sessionId);
  }));

  // Ouvre le droit de réponse aux joueurs pour la question "ouverte"
  // actuellement sélectionnée (passe de "draft" à "active").
  socket.on("question:buzzer:open", safeHandler(socket, "question:buzzer:open", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    if (state.status === "paused") {
      return socket.emit("error", { message: PAUSED_ERROR });
    }
    const cq = state.currentQuestion;
    if (!cq || cq.type !== "buzzer" || cq.status !== "draft") return;
    cq.status = "active";
    cq.activatedAt = Date.now();
    await pool.execute(
      "UPDATE questions SET status='active', used=TRUE, activated_at=NOW() WHERE id=:id",
      { id: cq.id }
    );
    await broadcastState(sessionId);
  }));

  socket.on("question:qcm:random", safeHandler(socket, "question:qcm:random", async (payload) => {
    if (!isJury(socket)) return;
    const { points } = payload || {};
    const sessionId = socket.data.sessionId;
    if (getState(sessionId).status === "paused") {
      return socket.emit("error", { message: PAUSED_ERROR });
    }
    const rows = await q(
      "SELECT * FROM questions WHERE session_id=:sid AND type='qcm' AND used=FALSE ORDER BY RAND() LIMIT 1",
      { sid: sessionId }
    );
    if (!rows.length) return socket.emit("error", { message: "Plus de question QCM disponible" });
    const qrow = rows[0];
    const finalPoints = points || qrow.points;
    await pool.execute(
      "UPDATE questions SET status='active', used=TRUE, activated_at=NOW() WHERE id=:id",
      { id: qrow.id }
    );
    const state = getState(sessionId);
    state.currentQuestion = {
      id: qrow.id,
      type: "qcm",
      text: qrow.text,
      options: parseJsonColumn(qrow.options, []),
      correctOptions: parseJsonColumn(qrow.correct_options, []),
      multiple: !!qrow.multiple,
      points: finalPoints,
      status: "active",
      activatedAt: Date.now(),
      answeredPlayerIds: new Set(),
    };
    await emitToJury(sessionId, "bank:updated", {});
    await broadcastState(sessionId);
  }));

  socket.on("question:qcm:activate", safeHandler(socket, "question:qcm:activate", async ({ questionId, points }) => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    if (getState(sessionId).status === "paused") {
      return socket.emit("error", { message: PAUSED_ERROR });
    }
    const rows = await q("SELECT * FROM questions WHERE id=:id AND session_id=:sid", {
      id: questionId,
      sid: sessionId,
    });
    if (!rows.length) return;
    const qrow = rows[0];
    const finalPoints = points || qrow.points;
    await pool.execute(
      "UPDATE questions SET status='active', used=TRUE, activated_at=NOW() WHERE id=:id",
      { id: qrow.id }
    );
    const state = getState(sessionId);
    state.currentQuestion = {
      id: qrow.id,
      type: "qcm",
      text: qrow.text,
      options: parseJsonColumn(qrow.options, []),
      correctOptions: parseJsonColumn(qrow.correct_options, []),
      multiple: !!qrow.multiple,
      points: finalPoints,
      status: "active",
      activatedAt: Date.now(),
      answeredPlayerIds: new Set(),
    };
    await emitToJury(sessionId, "bank:updated", {});
    await broadcastState(sessionId);
  }));

  socket.on("buzzer:press", safeHandler(socket, "buzzer:press", async () => {
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    const q = state.currentQuestion;
    if (!q || q.type !== "buzzer" || q.status !== "active") return;
    const player = state.players.get(socket.data.deviceId);
    if (!player) return;
    const already = q.buzzerQueue.some((b) => b.playerId === player.id);
    if (already) return;
    q.buzzerQueue.push({ playerId: player.id, name: player.name, at: Date.now(), judged: null });
    // Son centralisé sur le poste du jury uniquement (pas sur les téléphones
    // des joueurs).
    await emitToJury(sessionId, "sound:play", { sound: "buzzer" });
    await broadcastState(sessionId);
  }));

  socket.on("buzzer:judge", safeHandler(socket, "buzzer:judge", async ({ result }) => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    const q = state.currentQuestion;
    if (!q || q.type !== "buzzer" || q.status !== "active") return;
    const holder = currentBuzzerHolder({ currentQuestion: q });
    if (!holder) return;

    if (result === "good") {
      holder.judged = "good";
      await emitToJury(sessionId, "sound:play", { sound: "correct" });
      for (const [deviceId, p] of state.players.entries()) {
        if (p.id === holder.playerId) {
          p.score += q.points;
          await pool.execute("UPDATE players SET score = score + :pts WHERE id = :id", {
            pts: q.points,
            id: p.id,
          });
          // Conserve la trace de la bonne réponse pour le détail de session
          // (affiché sur la page de résultats une fois la session terminée).
          await pool.execute(
            "INSERT INTO answers (question_id, player_id, selected, is_correct, points_earned) VALUES (:qid, :pid, NULL, TRUE, :pts)",
            { qid: q.id, pid: p.id, pts: q.points }
          );
        }
      }
      q.status = "closed";
      q.reveal = { winner: holder.name, points: q.points };
      await pool.execute("UPDATE questions SET status='closed' WHERE id=:id", { id: q.id });
    } else if (result === "bad") {
      holder.judged = "bad";
      await emitToJury(sessionId, "sound:play", { sound: "wrong" });
      const next = currentBuzzerHolder({ currentQuestion: q });
      if (!next) {
        q.status = "closed";
        q.reveal = { winner: null, points: 0 };
        await pool.execute("UPDATE questions SET status='closed' WHERE id=:id", { id: q.id });
      }
    } else if (result === "skip") {
      holder.judged = "skip";
      const next = currentBuzzerHolder({ currentQuestion: q });
      if (!next) {
        q.status = "closed";
        q.reveal = { winner: null, points: 0 };
        await pool.execute("UPDATE questions SET status='closed' WHERE id=:id", { id: q.id });
      }
    }
    await broadcastState(sessionId);
  }));

  socket.on("qcm:answer", safeHandler(socket, "qcm:answer", async ({ selected }) => {
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    const q = state.currentQuestion;
    if (!q || q.type !== "qcm" || q.status !== "active") return;
    const player = state.players.get(socket.data.deviceId);
    if (!player) return;
    if (q.answeredPlayerIds.has(player.id)) return;

    const chosen = [...selected].sort();
    const correct = [...q.correctOptions].sort();
    const isCorrect =
      chosen.length === correct.length && chosen.every((v, i) => v === correct[i]);
    const pointsEarned = isCorrect ? q.points : 0;

    q.answeredPlayerIds.add(player.id);

    if (isCorrect) {
      player.score += pointsEarned;
      await pool.execute("UPDATE players SET score = score + :pts WHERE id=:id", {
        pts: pointsEarned,
        id: player.id,
      });
    }

    await pool.execute(
      "INSERT INTO answers (question_id, player_id, selected, is_correct, points_earned) VALUES (:qid,:pid,:sel,:ok,:pts)",
      {
        qid: q.id,
        pid: player.id,
        sel: JSON.stringify(chosen),
        ok: isCorrect,
        pts: pointsEarned,
      }
    );

    const connectedCount = [...state.players.values()].filter((p) => p.connected).length || state.players.size;
    if (q.answeredPlayerIds.size >= connectedCount) {
      q.status = "closed";
      q.reveal = { correctOptions: q.correctOptions };
      await pool.execute("UPDATE questions SET status='closed' WHERE id=:id", { id: q.id });
    }

    await broadcastState(sessionId);
  }));

  socket.on("question:close", safeHandler(socket, "question:close", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    const q = state.currentQuestion;
    if (!q || q.status !== "active") return;
    q.status = "closed";
    if (q.type === "qcm") q.reveal = { correctOptions: q.correctOptions };
    await pool.execute("UPDATE questions SET status='closed' WHERE id=:id", { id: q.id });
    await broadcastState(sessionId);
  }));

  socket.on("question:next", safeHandler(socket, "question:next", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    state.currentQuestion = null;
    await broadcastState(sessionId);
  }));

  // Permet au jury de passer directement à la question suivante alors que la
  // question en cours est encore active (ex: personne n'a buzzé). Clôture la
  // question active en base si besoin, puis vide la question courante.
  socket.on("question:skip-to-next", safeHandler(socket, "question:skip-to-next", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    const q = state.currentQuestion;
    if (q && q.status === "active") {
      await pool.execute("UPDATE questions SET status='closed' WHERE id=:id", { id: q.id });
    }
    state.currentQuestion = null;
    await broadcastState(sessionId);
  }));

  socket.on("disconnect", safeHandler(socket, "disconnect", async () => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) return;
    if (socket.data.role === "player" && socket.data.deviceId) {
      const state = getState(sessionId);
      const p = state.players.get(socket.data.deviceId);
      if (p) p.connected = false;
      await broadcastState(sessionId);
    }
  }));
});

// Filet de sécurité supplémentaire : si une erreur passe malgré tout à
// travers les mailles (safeHandler couvre déjà tous les événements socket),
// on la logue au lieu de laisser Node arrêter tout le serveur.
process.on("unhandledRejection", (err) => {
  console.error("Erreur non gérée (le serveur continue de tourner) :", err);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Serveur quiz démarré sur le port ${PORT}`));
