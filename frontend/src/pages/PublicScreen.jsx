import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { connectAndJoin } from "../socket.js";

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

  if (!state) return <div className="public-screen center"><p>Connexion...</p></div>;

  const q = state.currentQuestion;

  return (
    <div className="public-screen">
      <header>
        <h1>{state.sessionName}</h1>
        <span className={`badge badge-${state.status}`}>{state.status}</span>
      </header>

      <div className="public-grid">
        <section className="public-question">
          {!q && <p className="waiting-big">En attente de la prochaine question...</p>}
          {q && (
            <>
              <div className="row gap between">
                <span className="tag">{q.type === "buzzer" ? "🔔 Buzzer" : "📝 QCM"}</span>
                <span className="timer">⏱ {elapsed}s</span>
              </div>
              <h2 className="question-text-big">{q.text}</h2>

              {q.type === "qcm" && (
                <div className="options-grid-big">
                  {q.options.map((opt, i) => (
                    <div key={i} className={`option-big ${q.status === "closed" && state.reveal?.correctOptions?.includes(i) ? "correct" : ""}`}>
                      {opt}
                    </div>
                  ))}
                </div>
              )}

              {q.type === "buzzer" && (
                <div className="buzzer-public">
                  {state.buzzer?.currentPlayerName ? (
                    <p className="answering-now">🎤 {state.buzzer.currentPlayerName} répond...</p>
                  ) : q.status === "active" ? (
                    <p className="waiting-big">En attente d'un buzz...</p>
                  ) : (
                    <p className="answering-now">
                      {state.reveal?.winner ? `🏆 ${state.reveal.winner} a gagné !` : "Personne n'a trouvé"}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section className="public-ranking">
          <h3>Classement</h3>
          <ol>
            {state.players.map((p, i) => (
              <li key={p.id} className={i === 0 ? "first" : ""}>
                <span className="rank">{i + 1}</span>
                <span className="name">{p.name}</span>
                <span className="score">{p.score} pts</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
