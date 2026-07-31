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

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "*" },
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
    "SELECT id, type, text, options, correct_options, multiple, points, used, status FROM questions WHERE session_id = :sid ORDER BY created_at",
    { sid: req.params.id }
  );
  res.json(rows);
});

app.post("/api/sessions/:id/questions", async (req, res) => {
  if (!(await requireJuryCode(req, res))) return;
  const { type, text, options, correctOptions, multiple, points } = req.body;
  const result = await pool.execute(
    `INSERT INTO questions (session_id, type, text, options, correct_options, multiple, points)
     VALUES (:sid, :type, :text, :options, :correctOptions, :multiple, :points)`,
    {
      sid: req.params.id,
      type,
      text,
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

async function getSessionRow(sessionId) {
  const rows = await q("SELECT * FROM sessions WHERE id = :id", { id: sessionId });
  return rows[0] || null;
}

async function broadcastState(sessionId) {
  const state = getState(sessionId);
  const sessionRow = await getSessionRow(sessionId);
  if (!sessionRow) return;
  const sockets = await io.in(room(sessionId)).fetchSockets();
  for (const s of sockets) {
    const role = s.data.role;
    if (role === "jury") {
      s.emit("session:state", juryView(state, sessionRow.name));
    } else if (role === "player") {
      s.emit("session:state", playerView(state, sessionRow.name, s.data.deviceId));
    } else {
      s.emit("session:state", publicView(state, sessionRow.name));
    }
  }
}

function isJury(socket) {
  return socket.data.role === "jury";
}

io.on("connection", (socket) => {
  socket.on("join", async ({ sessionId, role, code, deviceId }) => {
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
  });

  socket.on("session:start", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    await pool.execute("UPDATE sessions SET status='started' WHERE id=:id", { id: sessionId });
    getState(sessionId).status = "started";
    await broadcastState(sessionId);
  });

  socket.on("session:end", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    await pool.execute("UPDATE sessions SET status='ended' WHERE id=:id", { id: sessionId });
    const state = getState(sessionId);
    state.status = "ended";
    state.currentQuestion = null;
    await broadcastState(sessionId);
  });

  socket.on("question:buzzer:start", async ({ text, points }) => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const result = await pool.execute(
      "INSERT INTO questions (session_id, type, text, points, status) VALUES (:sid,'buzzer',:text,:points,'active')",
      { sid: sessionId, text: text || "Question buzzer", points: points || 100 }
    );
    const state = getState(sessionId);
    state.currentQuestion = {
      id: result[0].insertId,
      type: "buzzer",
      text: text || "Question buzzer",
      points: points || 100,
      status: "active",
      activatedAt: Date.now(),
      buzzerQueue: [],
    };
    await broadcastState(sessionId);
  });

  socket.on("question:qcm:random", async (payload) => {
    if (!isJury(socket)) return;
    const { points } = payload || {};
    const sessionId = socket.data.sessionId;
    const rows = await q(
      "SELECT * FROM questions WHERE session_id=:sid AND type='qcm' AND used=FALSE ORDER BY RAND() LIMIT 1",
      { sid: sessionId }
    );
    if (!rows.length) return socket.emit("error", { message: "Plus de question QCM disponible" });
    const qrow = rows[0];
    const finalPoints = points || qrow.points;
    await pool.execute("UPDATE questions SET status='active', used=TRUE WHERE id=:id", { id: qrow.id });
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
    await broadcastState(sessionId);
  });

  socket.on("question:qcm:activate", async ({ questionId, points }) => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const rows = await q("SELECT * FROM questions WHERE id=:id AND session_id=:sid", {
      id: questionId,
      sid: sessionId,
    });
    if (!rows.length) return;
    const qrow = rows[0];
    const finalPoints = points || qrow.points;
    await pool.execute("UPDATE questions SET status='active', used=TRUE WHERE id=:id", { id: qrow.id });
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
    await broadcastState(sessionId);
  });

  socket.on("buzzer:press", async () => {
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    const q = state.currentQuestion;
    if (!q || q.type !== "buzzer" || q.status !== "active") return;
    const player = state.players.get(socket.data.deviceId);
    if (!player) return;
    const already = q.buzzerQueue.some((b) => b.playerId === player.id);
    if (already) return;
    q.buzzerQueue.push({ playerId: player.id, name: player.name, at: Date.now(), judged: null });
    await broadcastState(sessionId);
  });

  socket.on("buzzer:judge", async ({ result }) => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    const q = state.currentQuestion;
    if (!q || q.type !== "buzzer" || q.status !== "active") return;
    const holder = currentBuzzerHolder({ currentQuestion: q });
    if (!holder) return;

    if (result === "good") {
      holder.judged = "good";
      for (const [deviceId, p] of state.players.entries()) {
        if (p.id === holder.playerId) {
          p.score += q.points;
          await pool.execute("UPDATE players SET score = score + :pts WHERE id = :id", {
            pts: q.points,
            id: p.id,
          });
        }
      }
      q.status = "closed";
      q.reveal = { winner: holder.name, points: q.points };
      await pool.execute("UPDATE questions SET status='closed' WHERE id=:id", { id: q.id });
    } else if (result === "bad") {
      holder.judged = "bad";
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
  });

  socket.on("qcm:answer", async ({ selected }) => {
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
  });

  socket.on("question:close", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    const q = state.currentQuestion;
    if (!q || q.status !== "active") return;
    q.status = "closed";
    if (q.type === "qcm") q.reveal = { correctOptions: q.correctOptions };
    await pool.execute("UPDATE questions SET status='closed' WHERE id=:id", { id: q.id });
    await broadcastState(sessionId);
  });

  socket.on("question:next", async () => {
    if (!isJury(socket)) return;
    const sessionId = socket.data.sessionId;
    const state = getState(sessionId);
    state.currentQuestion = null;
    await broadcastState(sessionId);
  });

  socket.on("disconnect", async () => {
    const sessionId = socket.data.sessionId;
    if (!sessionId) return;
    if (socket.data.role === "player" && socket.data.deviceId) {
      const state = getState(sessionId);
      const p = state.players.get(socket.data.deviceId);
      if (p) p.connected = false;
      await broadcastState(sessionId);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Serveur quiz démarré sur le port ${PORT}`));