import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { connectAndJoin, getSocket } from "../socket.js";

export default function JuryPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const code = sessionStorage.getItem(`jury_code_${id}`);

  const [state, setState] = useState(null);
  const [bank, setBank] = useState([]);
  const [error, setError] = useState("");

  // formulaire nouvelle question QCM
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState(["", ""]);
  const [qCorrect, setQCorrect] = useState([]);
  const [qMultiple, setQMultiple] = useState(false);
  const [qPoints, setQPoints] = useState(100);

  // formulaire buzzer ad-hoc
  const [buzzerText, setBuzzerText] = useState("");
  const [buzzerPoints, setBuzzerPoints] = useState(100);

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
    loadBank();
    return () => {
      s.off("session:state", setState);
      s.off("error");
    };
  }, [id, code, navigate, loadBank]);

  function emit(event, payload) {
    getSocket().emit(event, payload);
  }

  async function submitQuestion(e) {
    e.preventDefault();
    const options = qOptions.filter((o) => o.trim() !== "");
    await api.createQuestion(id, code, {
      type: "qcm",
      text: qText,
      options,
      correctOptions: qCorrect,
      multiple: qMultiple,
      points: Number(qPoints),
    });
    setQText("");
    setQOptions(["", ""]);
    setQCorrect([]);
    setQMultiple(false);
    setQPoints(100);
    loadBank();
  }

  function toggleCorrect(idx) {
    setQCorrect((prev) =>
      qMultiple
        ? prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
        : [idx]
    );
  }

  async function removeQuestion(qid) {
    await api.deleteQuestion(id, code, qid);
    loadBank();
  }

  if (!state) return <div className="page center"><p>Connexion à la session...</p></div>;

  const q = state.currentQuestion;

  return (
    <div className="page">
      <header className="jury-header">
        <h1>🎛️ Pilotage — {state.sessionName}</h1>
        <div className="row gap">
          <span className={`badge badge-${state.status}`}>{state.status}</span>
          <button className="btn btn-primary" onClick={() => emit("session:start")}>
            ▶ Démarrer la session
          </button>
          <button className="btn btn-danger" onClick={() => emit("session:end")}>
            ⏹ Terminer la session
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="jury-grid">
        {/* Colonne question en cours */}
        <section className="card">
          <h3>Question en cours</h3>
          {!q && (
            <>
              <p className="muted">Aucune question active. Lancez un round ci-dessous.</p>
              <div className="subsection">
                <h4>🔔 Mode buzzer (sans question préalable)</h4>
                <input
                  placeholder="Texte de la question (optionnel)"
                  value={buzzerText}
                  onChange={(e) => setBuzzerText(e.target.value)}
                />
                <input
                  type="number"
                  value={buzzerPoints}
                  onChange={(e) => setBuzzerPoints(e.target.value)}
                />
                <button
                  className="btn btn-secondary"
                  onClick={() => emit("question:buzzer:start", { text: buzzerText, points: Number(buzzerPoints) })}
                >
                  Démarrer le buzzer
                </button>
              </div>
              <div className="subsection">
                <h4>📝 Mode QCM</h4>
                <button className="btn btn-secondary" onClick={() => emit("question:qcm:random")}>
                  🎲 Question QCM aléatoire
                </button>
              </div>
            </>
          )}

          {q && q.type === "buzzer" && (
            <div>
              <p className="question-text">{q.text}</p>
              <p className="muted">Points : {q.points} — Statut : {q.status}</p>
              <p>
                <strong>Joueur en train de répondre :</strong>{" "}
                {state.buzzer?.currentPlayerName || "En attente d'un buzz..."}
              </p>
              {state.buzzer?.currentPlayerName && q.status === "active" && (
                <div className="row gap">
                  <button className="btn btn-success" onClick={() => emit("buzzer:judge", { result: "good" })}>
                    ✅ Bonne réponse
                  </button>
                  <button className="btn btn-danger" onClick={() => emit("buzzer:judge", { result: "bad" })}>
                    ❌ Mauvaise réponse
                  </button>
                  <button className="btn btn-ghost" onClick={() => emit("buzzer:judge", { result: "skip" })}>
                    ⏭ Passer
                  </button>
                </div>
              )}
              {q.status === "closed" && q.reveal && (
                <p className="reveal">
                  {q.reveal.winner ? `🏆 ${q.reveal.winner} gagne ${q.reveal.points} pts` : "Personne n'a trouvé"}
                </p>
              )}
              <button className="btn btn-primary" onClick={() => emit("question:next")}>
                ➡ Question suivante
              </button>
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
              </p>
              {q.status === "active" && (
                <button className="btn btn-danger" onClick={() => emit("question:close")}>
                  Clôturer maintenant
                </button>
              )}
              <button className="btn btn-primary" onClick={() => emit("question:next")}>
                ➡ Question suivante
              </button>
            </div>
          )}
        </section>

        {/* Colonne classement */}
        <section className="card">
          <h3>Classement en direct</h3>
          <ol className="ranking">
            {state.players.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <span>{p.score} pts</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Colonne banque de questions QCM */}
        <section className="card">
          <h3>Banque de questions QCM</h3>
          <form className="form" onSubmit={submitQuestion}>
            <input
              placeholder="Intitulé de la question"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              required
            />
            {qOptions.map((opt, i) => (
              <div key={i} className="row gap">
                <input
                  type={qMultiple ? "checkbox" : "radio"}
                  name="correct"
                  checked={qCorrect.includes(i)}
                  onChange={() => toggleCorrect(i)}
                />
                <input
                  placeholder={`Choix ${i + 1}`}
                  value={opt}
                  onChange={(e) => {
                    const copy = [...qOptions];
                    copy[i] = e.target.value;
                    setQOptions(copy);
                  }}
                />
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={() => setQOptions([...qOptions, ""])}>
              + Ajouter un choix
            </button>
            <label className="row gap">
              <input type="checkbox" checked={qMultiple} onChange={(e) => setQMultiple(e.target.checked)} />
              Choix multiple
            </label>
            <label>Points</label>
            <input type="number" value={qPoints} onChange={(e) => setQPoints(e.target.value)} />
            <button type="submit" className="btn btn-primary">Ajouter à la banque</button>
          </form>

          <ul className="bank-list">
            {bank.map((qq) => (
              <li key={qq.id}>
                <span>{qq.text} {qq.used ? "(déjà utilisée)" : ""}</span>
                <button className="btn btn-ghost small" onClick={() => emit("question:qcm:activate", { questionId: qq.id })}>
                  Activer
                </button>
                <button className="btn btn-danger small" onClick={() => removeQuestion(qq.id)}>
                  Suppr.
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
