import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Radio, Mic, Trophy, Star } from "lucide-react";
import { getDeviceId } from "../api.js";
import { connectAndJoin, getSocket } from "../socket.js";
import LoadingScreen from "../components/LoadingScreen.jsx";
import NavBar from "../components/NavBar.jsx";
import { useKeepAwake } from "../hooks/useKeepAwake.js";


export default function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState([]);
  const [flashBuzz, setFlashBuzz] = useState(false);

  // Empêche l'écran du joueur (mobile en particulier) de s'éteindre pendant
  // la session, pour ne pas rater un buzz ou une question à cause de la mise
  // en veille automatique.
  useKeepAwake(true);

  useEffect(() => {
    const deviceId = getDeviceId();
    const s = connectAndJoin({ sessionId: id, role: "player", deviceId });
    s.on("session:state", (st) => {
      setState(st);
      if (!st.me) {
        // Ce device n'a pas de joueur enregistré -> retour à la page d'accueil de session
        navigate(`/session/${id}`);
      }
    });
    return () => s.off("session:state");
  }, [id, navigate]);

  // Une fois la session terminée, direction la page de résultats, comme pour
  // le jury et l'écran public.
  useEffect(() => {
    if (state?.status === "ended") {
      navigate(`/session/${id}/results`, { replace: true });
    }
  }, [state?.status, id, navigate]);

  useEffect(() => {
    // Réinitialise la sélection QCM à chaque nouvelle question
    setSelected([]);
  }, [state?.currentQuestion?.id]);

  function pressBuzzer() {
    // Le son du buzzer est centralisé sur le poste du jury (pas de lecture
    // locale ici) : le serveur ne l'envoie qu'à la connexion jury.
    getSocket().emit("buzzer:press");
    setFlashBuzz(true);
    setTimeout(() => setFlashBuzz(false), 300);
  }

  function toggleOption(i) {
    const multiple = state.currentQuestion.multiple;
    setSelected((prev) =>
      multiple ? (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]) : [i]
    );
  }

  function submitAnswer() {
    getSocket().emit("qcm:answer", { selected });
  }

  if (!state) return <LoadingScreen label="Connexion..." />;

  const q = state.currentQuestion;

  return (
    <div className="page center player-page">
      <NavBar showResults={false} />
      <div className="player-header">
        <h2>{state.me?.name}</h2>
        <span className="score-pill">{state.me?.score ?? 0} pts</span>
      </div>
      <p className="muted">{state.sessionName}</p>

      {!q && <p className="waiting">En attente de la prochaine question...</p>}

      {q && q.type === "buzzer" && (
        <div className="buzzer-zone">
          <p className="question-text">
            {q.text}
            <span className="points-badge">
              <Star size={12} />
              {q.points} pts
            </span>
          </p>
          {q.status === "active" ? (
            state.canBuzz ? (
              <button className={`buzzer-btn ${flashBuzz ? "flash" : ""}`} onClick={pressBuzzer}>
                <Radio size={32} />
                BUZZ
              </button>
            ) : state.isMyTurn ? (
              <p className="my-turn row gap">
                <Mic size={20} />
                C'est à vous de répondre à l'oral !
              </p>
            ) : (
              <p className="muted">Un autre joueur a buzzé...</p>
            )
          ) : (
            <p className="reveal">
              {q.status === "closed" && state.reveal?.winner ? (
                <span className="row gap">
                  <Trophy size={16} />
                  {state.reveal.winner} a gagné {state.reveal.points} pts
                </span>
              ) : (
                "Question terminée"
              )}
            </p>
          )}
        </div>
      )}

      {q && q.type === "qcm" && (
        <div className="qcm-zone">
          <p className="question-text">
            {q.text}
            <span className="points-badge">
              <Star size={12} />
              {q.points} pts
            </span>
          </p>
          {q.status === "active" && !state.hasAnswered ? (
            <>
              <div className="options-grid">
                {q.options.map((opt, i) => (
                  <button
                    key={i}
                    className={`option-btn ${selected.includes(i) ? "selected" : ""}`}
                    onClick={() => toggleOption(i)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" disabled={!selected.length} onClick={submitAnswer}>
                Valider ma réponse
              </button>
            </>
          ) : state.hasAnswered && q.status === "active" ? (
            <p className="muted">Réponse envoyée, en attente des autres joueurs...</p>
          ) : (
            <p className="reveal">La question est terminée.</p>
          )}
        </div>
      )}

    </div>
  );
}
