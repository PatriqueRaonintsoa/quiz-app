import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Bell, ListChecks, Timer, Mic, Trophy, PartyPopper, Star } from "lucide-react";
import { connectAndJoin } from "../socket.js";
import LoadingScreen from "../components/LoadingScreen.jsx";

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// Minuteur de session (même logique que sur la page de pilotage jury) :
// tourne pendant que le statut est "started", se fige en pause ou une fois
// la session terminée.
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

// Style du podium pour les 3 premiers du classement : un badge numéroté
// (1, 2, 3) coloré au lieu d'une pictogramme identique pour les trois.
const PODIUM = [
  { className: "rank-gold" },
  { className: "rank-silver" },
  { className: "rank-bronze" },
];

export default function PublicScreen() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const s = connectAndJoin({ sessionId: id, role: "public" });
    s.on("session:state", setState);
    return () => s.off("session:state");
  }, [id]);

  useEffect(() => {
    if (!state?.currentQuestion?.activatedAt) return setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - state.currentQuestion.activatedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.currentQuestion?.activatedAt]);

  const timerLabel = useSessionTimer(state?.timer, state?.status);

  if (!state) return <LoadingScreen label="Connexion..." />;

  const q = state.currentQuestion;
  const ended = state.status === "ended";
  const [first, second, third, ...rest] = state.players;

  return (
    <div className="public-screen">
      <header>
        <h1>{state.sessionName}</h1>
        <div className="row gap">
          <span className={`badge badge-${state.status}`}>{state.status}</span>
          <span className="session-timer">{timerLabel}</span>
        </div>
      </header>

      {/* Trois vues qui ne s'affichent jamais en même temps : "question" dès
          qu'une question (QCM activé ou buzzer démarré) est en cours, y
          compris pendant la révélation du résultat ; "classement" entre deux
          questions, une fois que le jury est passé à la suite ; et enfin le
          "podium final" dès que la session est terminée. */}
      {ended ? (
        <section className="public-view public-podium">
          <div className="podium-header">
            <PartyPopper size={40} />
            <h2>Session terminée !</h2>
          </div>

          {state.players.length === 0 ? (
            <p className="waiting-big">Aucun joueur n'a participé.</p>
          ) : (
            <>
              <div className="podium-stage">
                <div className="podium-block podium-silver">
                  <span className="podium-rank">2</span>
                  <p className="podium-name">{second ? second.name : "—"}</p>
                  <p className="podium-score">{second ? `${second.score} pts` : ""}</p>
                </div>
                <div className="podium-block podium-gold">
                  <Trophy size={32} />
                  <span className="podium-rank">1</span>
                  <p className="podium-name">{first ? first.name : "—"}</p>
                  <p className="podium-score">{first ? `${first.score} pts` : ""}</p>
                </div>
                <div className="podium-block podium-bronze">
                  <span className="podium-rank">3</span>
                  <p className="podium-name">{third ? third.name : "—"}</p>
                  <p className="podium-score">{third ? `${third.score} pts` : ""}</p>
                </div>
              </div>

              {rest.length > 0 && (
                <ol className="podium-rest">
                  {rest.map((p, i) => (
                    <li key={p.id}>
                      <span className="rank">{i + 4}</span>
                      <span className="name">{p.name}</span>
                      <span className="score">{p.score} pts</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      ) : q ? (
        <section className="public-view public-question">
          <div className="row gap between">
            <div className="row gap">
              <span className="tag row gap">
                {q.type === "buzzer" ? <Bell size={16} /> : <ListChecks size={16} />}
                {q.type === "buzzer" ? "Buzzer" : "QCM"}
              </span>
              <span className="tag tag-points row gap">
                <Star size={16} />
                {q.points} pts
              </span>
            </div>
            <span className="timer row gap">
              <Timer size={18} />
              {elapsed}s
            </span>
          </div>
          <h2 className="question-text-big">{q.text}</h2>

          {q.type === "qcm" && (
            <div className="options-grid-big">
              {q.options.map((opt, i) => (
                <div
                  key={i}
                  className={`option-big ${
                    q.status === "closed" && state.reveal?.correctOptions?.includes(i) ? "correct" : ""
                  }`}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}

          {q.type === "buzzer" && (
            <div className="buzzer-public">
              {state.buzzer?.currentPlayerName ? (
                <p className="answering-now row gap">
                  <Mic size={28} />
                  {state.buzzer.currentPlayerName} répond...
                </p>
              ) : q.status === "active" ? (
                <p className="waiting-big">En attente d'un buzz...</p>
              ) : (
                <p className="answering-now row gap">
                  {state.reveal?.winner ? (
                    <>
                      <Trophy size={28} />
                      {state.reveal.winner} a gagné !
                    </>
                  ) : (
                    "Personne n'a trouvé"
                  )}
                </p>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="public-view public-ranking">
          <h3>Classement</h3>
          {state.players.length === 0 ? (
            <p className="waiting-big">En attente des joueurs...</p>
          ) : (
            <ol>
              {state.players.map((p, i) => {
                const podium = PODIUM[i];
                return (
                  <li key={p.id} className={podium ? podium.className : ""}>
                    <span className={`rank ${podium ? "rank-badge" : ""}`}>{i + 1}</span>
                    <span className="name">{p.name}</span>
                    <span className="score">{p.score} pts</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
