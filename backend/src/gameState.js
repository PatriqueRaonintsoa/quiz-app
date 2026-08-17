// État "live" de chaque session, gardé en mémoire pour la fluidité temps réel.
// Les données durables (joueurs, scores, questions) restent en base MySQL.

const sessions = new Map(); // sessionId -> state

export function getState(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      status: "waiting",
      players: new Map(), // deviceId -> {id, name, score, socketId, connected}
      currentQuestion: null, // {id, type, text, options, multiple, points, status, activatedAt, correctOptions, reveal, answeredPlayerIds:Set, buzzerQueue}
      buzzerQueue: [], // [{playerId, name, at, judged: null|'good'|'bad'|'skip'}]
    });
  }
  return sessions.get(sessionId);
}

export function removeSession(sessionId) {
  sessions.delete(sessionId);
}

export function sortedPlayers(state) {
  return [...state.players.values()]
    .map((p) => ({ id: p.id, name: p.name, score: p.score, connected: !!p.connected }))
    .sort((a, b) => b.score - a.score);
}

export function currentBuzzerHolder(state) {
  const q = state.currentQuestion;
  if (!q || q.type !== "buzzer") return null;
  // Le premier de la file qui n'a pas encore été jugé "bad"/"skip"
  return q.buzzerQueue?.find((b) => !b.judged) || null;
}

function baseCurrentQuestion(q) {
  return {
    id: q.id,
    type: q.type,
    text: q.text,
    options: q.options || null,
    multiple: !!q.multiple,
    points: q.points,
    status: q.status, // 'draft' | 'active' | 'closed'
    activatedAt: q.activatedAt,
  };
}

function buzzerInfo(q) {
  const holder = currentBuzzerHolder({ currentQuestion: q });
  return {
    currentPlayerName: holder ? holder.name : null,
    currentPlayerId: holder ? holder.playerId : null,
    queue: q.buzzerQueue.map((b) => ({ name: b.name, judged: b.judged })),
  };
}

// Construit la vue publique/joueur (sans les réponses correctes tant que non
// révélées, et sans les questions "ouvertes" tant qu'elles sont seulement
// sélectionnées par le jury et pas encore lancées via "Démarrer le buzzer").
export function publicView(state, sessionName) {
  const q = state.currentQuestion;
  let currentQuestion = null;
  let buzzer = null;
  let reveal = null;

  const hiddenFromPublic = q && q.type === "buzzer" && q.status === "draft";

  if (q && !hiddenFromPublic) {
    currentQuestion = baseCurrentQuestion(q);
    if (q.type === "buzzer") buzzer = buzzerInfo(q);
    if (q.status === "closed" && q.reveal) reveal = q.reveal;
  }

  return {
    sessionName,
    status: state.status,
    players: sortedPlayers(state),
    currentQuestion,
    buzzer,
    reveal,
  };
}

// Le jury voit toujours la question courante en entier (y compris en statut
// "draft", avant l'ouverture du buzzer aux joueurs), avec la réponse.
export function juryView(state, sessionName) {
  const base = publicView(state, sessionName);
  const q = state.currentQuestion;
  if (q) {
    base.currentQuestion = baseCurrentQuestion(q);
    base.currentQuestion.correctOptions = q.correctOptions || null;
    base.currentQuestion.answerText = q.answerText || null;
    base.currentQuestion.answeredCount = q.answeredPlayerIds ? q.answeredPlayerIds.size : 0;
    base.currentQuestion.totalPlayers = state.players.size;
    if (q.type === "buzzer") {
      base.buzzer = buzzerInfo(q);
      if (q.status === "closed" && q.reveal) base.reveal = q.reveal;
    }
  }
  return base;
}

export function playerView(state, sessionName, deviceId) {
  const base = publicView(state, sessionName);
  const me = state.players.get(deviceId);
  const q = state.currentQuestion;
  let canBuzz = false;
  let hasAnswered = false;
  let isMyTurn = false;

  if (me && q && q.status === "active") {
    if (q.type === "buzzer") {
      const alreadyIn = q.buzzerQueue.some((b) => b.playerId === me.id);
      canBuzz = !alreadyIn;
      const holder = currentBuzzerHolder({ currentQuestion: q });
      isMyTurn = holder ? holder.playerId === me.id : false;
    } else if (q.type === "qcm") {
      hasAnswered = q.answeredPlayerIds.has(me.id);
    }
  }

  return {
    ...base,
    me: me ? { id: me.id, name: me.name, score: me.score } : null,
    canBuzz,
    hasAnswered,
    isMyTurn,
  };
}
