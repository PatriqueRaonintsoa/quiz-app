import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  SlidersHorizontal,
  Play,
  Pause,
  Square,
  Bell,
  ListChecks,
  CheckCircle2,
  XCircle,
  SkipForward,
  Trophy,
  ArrowRight,
  Tv,
  Eye,
  UserMinus,
} from "lucide-react";
import { api } from "../api.js";
import { connectAndJoin, getSocket } from "../socket.js";
import { playSound } from "../sounds.js";
import LoadingScreen from "../components/LoadingScreen.jsx";
import NavBar from "../components/NavBar.jsx";
import Footer from "../components/Footer.jsx";
import AddQuestionModal from "../components/AddQuestionModal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// Minuteur de session : tourne pendant que le statut est "started", se fige
// pendant une pause ou une fois la session terminée.
function useSessionTimer(timer, status) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "started") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (!timer?.startedAt) return "00:00:00";
  const reference =
    status === "ended" && timer.endedAt
      ? timer.endedAt
      : status === "paused" && timer.pausedAt
      ? timer.pausedAt
      : now;
  const elapsedMs = reference - timer.startedAt - (timer.pausedDurationMs || 0);
  return formatDuration(elapsedMs);
}

// Chrono de la question en cours : tourne depuis son ouverture (activatedAt)
// tant qu'elle est active, et se fige dès qu'elle passe en "closed" (garde la
// dernière valeur affichée).
function useQuestionTimer(q) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!q?.activatedAt) {
      setElapsedMs(0);
      return;
    }
    if (q.status !== "active") return;
    const tick = () => setElapsedMs(Date.now() - q.activatedAt);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [q?.id, q?.status, q?.activatedAt]);

  return formatDuration(elapsedMs);
}

export default function JuryPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const code = sessionStorage.getItem(`jury_code_${id}`);

  const [state, setState] = useState(null);
  const [bank, setBank] = useState([]);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [playerToRemove, setPlayerToRemove] = useState(null);

  const timerLabel = useSessionTimer(state?.timer, state?.status);
  const questionTimerLabel = useQuestionTimer(state?.currentQuestion);

  const loadBank = useCallback(() => {
    if (code) api.listQuestions(id, code).then(setBank).catch(() => {});
  }, [id, code]);

  useEffect(() => {
    if (!code) {
      navigate(`/session/${id}`);
      return;
    }
    const s = connectAndJoin({ sessionId: id, role: "jury", code });
    s.on("session:state", setState);
    s.on("error", (e) => setError(e.message));
    // Le son (buzzer, bonne/mauvaise réponse) est centralisé ici : le
    // serveur ne l'envoie qu'au poste jury.
    s.on("sound:play", ({ sound }) => playSound(sound));
    // Dès qu'une question est sélectionnée/activée (donc marquée "utilisée"
    // côté serveur), on recharge la banque pour qu'elle bascule aussitôt
    // dans "Déjà utilisées" sans avoir à rafraîchir la page.
    s.on("bank:updated", loadBank);
    loadBank();
    return () => {
      s.off("session:state", setState);
      s.off("error");
      s.off("sound:play");
      s.off("bank:updated", loadBank);
    };
  }, [id, code, navigate, loadBank]);

  // Une fois la session terminée, plus rien à piloter : direction la page
  // de résultats, comme pour les autres rôles.
  useEffect(() => {
    if (state?.status === "ended") {
      navigate(`/session/${id}/results`, { replace: true });
    }
  }, [state?.status, id, navigate]);

  function emit(event, payload) {
    getSocket().emit(event, payload);
  }

  async function handleAddQuestion(payload) {
    await api.createQuestion(id, code, payload);
    setModalOpen(false);
    loadBank();
  }

  async function removeQuestion(qid) {
    await api.deleteQuestion(id, code, qid);
    loadBank();
  }

  if (!state) return <LoadingScreen label="Connexion à la session..." />;

  const q = state.currentQuestion;
  const unusedBank = bank.filter((b) => !b.used);
  const usedBank = bank.filter((b) => b.used);
  const paused = state.status === "paused";

  const missingQuestions = bank.length === 0;
  const missingPlayers = state.players.length < 2;
  const cannotStart = missingQuestions || missingPlayers;

  function confirmRemovePlayer() {
    if (!playerToRemove) return;
    emit("player:remove", { playerId: playerToRemove.id });
    setPlayerToRemove(null);
  }

  return (
    <div className="page page-wide">
      <NavBar />
      <header className="jury-header">
        <h1>
          <SlidersHorizontal size={26} />
          Pilotage — {state.sessionName}
        </h1>
        <div className="row gap">
          <span className={`badge badge-${state.status}`}>{state.status}</span>

          {state.status === "waiting" && (
            <button
              className="btn btn-primary btn-icon"
              disabled={cannotStart}
              title={
                cannotStart
                  ? "Ajoutez au moins une question et au moins deux joueurs avant de démarrer"
                  : undefined
              }
              onClick={() => emit("session:start")}
            >
              <Play size={16} />
              Démarrer la session
            </button>
          )}

          {(state.status === "started" || state.status === "paused") && (
            <button
              className="btn btn-secondary btn-icon"
              onClick={() => emit(state.status === "paused" ? "session:resume" : "session:pause")}
            >
              {state.status === "paused" ? <Play size={16} /> : <Pause size={16} />}
              {state.status === "paused" ? "Reprendre la session" : "Pauser la session"}
            </button>
          )}

          {state.status !== "waiting" && (
            <button className="btn btn-danger btn-icon" onClick={() => emit("session:end")}>
              <Square size={16} />
              Terminer la session
            </button>
          )}

          <span className="session-timer">{timerLabel}</span>
        </div>
      </header>

      {cannotStart && state.status === "waiting" && (
        <p className="muted start-hint">
          Pour démarrer la session, il faut :{" "}
          {missingQuestions && "au moins une question dans la banque"}
          {missingQuestions && missingPlayers && " et "}
          {missingPlayers && "au moins deux joueurs connectés"}.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="jury-grid">
        {/* Colonne question en cours */}
        <section className="card current-question-card">
          <h3>Question en cours</h3>

          {!q && (
            <p className="muted">
              Aucune question active. Sélectionnez-en une dans la banque de questions ci-dessous.
            </p>
          )}

          {q && q.type === "buzzer" && q.status === "draft" && (
            <div>
              <p className="question-text">{q.text}</p>
              <p className="muted">Points : {q.points}</p>
              {q.answerText && (
                <p className="answer-hint">
                  <Eye size={14} />
                  Réponse : {q.answerText}
                </p>
              )}
              <button
                className="btn btn-primary btn-icon"
                disabled={paused}
                title={paused ? "Reprenez la session pour démarrer le buzzer" : undefined}
                onClick={() => emit("question:buzzer:open")}
              >
                <Bell size={16} />
                Démarrer le buzzer
              </button>
            </div>
          )}

          {q && q.type === "buzzer" && (q.status === "active" || q.status === "closed") && (
            <div>
              <p className="question-text">{q.text}</p>
              <p className="muted">
                Points : {q.points} — Statut : {q.status}
                {q.status === "active" && (
                  <span className="question-timer">Chrono : {questionTimerLabel}</span>
                )}
              </p>
              {q.answerText && (
                <p className="answer-hint">
                  <Eye size={14} />
                  Réponse : {q.answerText}
                </p>
              )}
              <p>
                <strong>Joueur en train de répondre :</strong>{" "}
                {state.buzzer?.currentPlayerName || "En attente d'un buzz..."}
              </p>
              <div className="row gap wrap">
                {state.buzzer?.currentPlayerName && q.status === "active" && (
                  <>
                    <button className="btn btn-success btn-icon" onClick={() => emit("buzzer:judge", { result: "good" })}>
                      <CheckCircle2 size={16} />
                      Bonne réponse
                    </button>
                    <button className="btn btn-danger btn-icon" onClick={() => emit("buzzer:judge", { result: "bad" })}>
                      <XCircle size={16} />
                      Mauvaise réponse
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={() => emit("buzzer:judge", { result: "skip" })}>
                      <SkipForward size={16} />
                      Passer
                    </button>
                  </>
                )}
                {q.status === "active" && (
                  <button className="btn btn-ghost btn-icon" onClick={() => emit("question:skip-to-next")}>
                    <ArrowRight size={16} />
                    Passer à la question suivante
                  </button>
                )}
              </div>
              {q.status === "closed" && q.reveal && (
                <p className="reveal">
                  {q.reveal.winner ? (
                    <span className="row gap">
                      <Trophy size={16} />
                      {q.reveal.winner} gagne {q.reveal.points} pts
                    </span>
                  ) : (
                    "Personne n'a trouvé"
                  )}
                </p>
              )}
              {q.status === "closed" && (
                <button className="btn btn-primary btn-icon" onClick={() => emit("question:next")}>
                  Question suivante
                  <ArrowRight size={16} />
                </button>
              )}

              {state.buzzer?.queue?.length > 0 && (
                <div className="buzz-queue">
                  <h4>Ordre des buzz</h4>
                  <ol className="buzz-queue-list">
                    {state.buzzer.queue.map((b, i) => (
                      <li key={i} className={`judged-${b.judged || "pending"}`}>
                        <span className="buzz-rank">{i + 1}</span>
                        <span className="buzz-name">{b.name}</span>
                        {b.judged === "good" && <CheckCircle2 size={16} />}
                        {b.judged === "bad" && <XCircle size={16} />}
                        {b.judged === "skip" && <SkipForward size={16} />}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {q && q.type === "qcm" && (
            <div>
              <p className="question-text">{q.text}</p>
              <ul className="options-list">
                {q.options.map((opt, i) => (
                  <li key={i} className={q.correctOptions?.includes(i) ? "correct-option" : ""}>
                    {opt}
                  </li>
                ))}
              </ul>
              <p className="muted">
                Points : {q.points} — Réponses reçues : {q.answeredCount}/{q.totalPlayers}
                {q.status === "active" && (
                  <span className="question-timer">Chrono : {questionTimerLabel}</span>
                )}
              </p>
              {q.status === "active" && (
                <button className="btn btn-danger" onClick={() => emit("question:close")}>
                  Clôturer maintenant
                </button>
              )}
              <button className="btn btn-primary btn-icon" onClick={() => emit("question:next")}>
                Question suivante
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </section>

        {/* Colonne classement */}
        <section className="card">
          <h3>Classement en direct</h3>
          {state.players.length === 0 && (
            <p className="muted">Aucun joueur n'a encore rejoint la session.</p>
          )}
          <ol className="ranking">
            {state.players.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <span className="row gap">
                  <span>{p.score} pts</span>
                  <button
                    type="button"
                    className="remove-player-btn"
                    title={`Retirer ${p.name} de la session`}
                    onClick={() => setPlayerToRemove(p)}
                  >
                    <UserMinus size={15} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Colonne banque de questions */}
        <section className="card">
          <div className="row between bank-header">
            <h3>
              <ListChecks size={18} />
              Banque de questions
            </h3>
            <button type="button" className="btn btn-primary small" onClick={() => setModalOpen(true)}>
              Ajouter une question
            </button>
          </div>

          {paused && (
            <p className="muted start-hint">
              Session en pause : reprenez-la pour sélectionner ou activer une question.
            </p>
          )}

          <div className="bank-columns">
            <div className="bank-column">
              <h4>À utiliser</h4>
              <ul className="bank-list">
                {unusedBank.length === 0 && (
                  <li className="muted bank-empty">Aucune question en attente.</li>
                )}
                {unusedBank.map((qq) => (
                  <li key={qq.id}>
                    {qq.type === "buzzer" ? <Bell size={14} /> : <ListChecks size={14} />}
                    <span>
                      {qq.text} <em className="bank-points">({qq.points} pts)</em>
                    </span>
                    <button
                      className="btn btn-secondary small"
                      disabled={paused}
                      title={paused ? "Reprenez la session pour piloter une question" : undefined}
                      onClick={() =>
                        qq.type === "buzzer"
                          ? emit("question:buzzer:select", { questionId: qq.id })
                          : emit("question:qcm:activate", { questionId: qq.id })
                      }
                    >
                      {qq.type === "buzzer" ? "Sélectionner" : "Activer"}
                    </button>
                    <button className="btn btn-danger small" onClick={() => removeQuestion(qq.id)}>
                      Suppr.
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bank-divider" />

            <div className="bank-column">
              <h4>Déjà utilisées</h4>
              <ul className="bank-list">
                {usedBank.length === 0 && (
                  <li className="muted bank-empty">Aucune question utilisée pour l'instant.</li>
                )}
                {usedBank.map((qq) => (
                  <li key={qq.id} className="bank-used">
                    {qq.type === "buzzer" ? <Bell size={14} /> : <ListChecks size={14} />}
                    <span>{qq.text}</span>
                    <CheckCircle2 size={16} className="bank-used-icon" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div className="jury-public-link">
        <Link className="muted link icon-link" to={`/session/${id}/public`}>
          <Tv size={16} />
          Ouvrir l'écran public
        </Link>
      </div>

      {modalOpen && (
        <AddQuestionModal onClose={() => setModalOpen(false)} onSubmit={handleAddQuestion} />
      )}

      {playerToRemove && (
        <ConfirmModal
          title="Retirer ce joueur ?"
          message={`${playerToRemove.name} sera retiré de la session et perdra son score actuel.`}
          confirmLabel="Retirer"
          cancelLabel="Annuler"
          onConfirm={confirmRemovePlayer}
          onCancel={() => setPlayerToRemove(null)}
        />
      )}

      <Footer />
    </div>
  );
}
