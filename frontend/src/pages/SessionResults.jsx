import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Trophy, Medal, Home as HomeIcon, Bell, ListChecks, CheckCircle2, UserCheck, Star } from "lucide-react";
import { connectAndJoin } from "../socket.js";
import { api } from "../api.js";
import LoadingScreen from "../components/LoadingScreen.jsx";
import NavBar from "../components/NavBar.jsx";
import Footer from "../components/Footer.jsx";

export default function SessionResults() {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const s = connectAndJoin({ sessionId: id, role: "public" });
    s.on("session:state", setState);
    return () => s.off("session:state", setState);
  }, [id]);

  useEffect(() => {
    // Le détail (bonnes réponses + gagnants) n'est exposé par le serveur que
    // si la session est bien terminée.
    api.getResultsDetail(id).then(setDetail).catch(() => setDetail([]));
  }, [id]);

  if (!state) return <LoadingScreen label="Chargement des résultats..." />;

  const players = state.players || [];

  return (
    <div className="page home-page">
      <NavBar />
      <div className="home-hero">
        <Trophy size={54} className="results-trophy" />
        <h1>{state.sessionName}</h1>
        <p className="home-description">
          Cette session est terminée. Voici le classement final.
        </p>
      </div>

      <div className="card home-panel results-panel">
        <h3 className="home-panel-title">Classement final</h3>
        {players.length === 0 && (
          <p className="muted">Aucun joueur n'a participé à cette session.</p>
        )}
        <ol className="ranking results-ranking">
          {players.map((p, i) => (
            <li key={p.id} className={i === 0 ? "first" : ""}>
              <span className="rank">
                {i < 3 ? <Medal size={18} /> : i + 1}
              </span>
              <span className="name">{p.name}</span>
              <span className="score">{p.score} pts</span>
            </li>
          ))}
        </ol>
      </div>

      {detail && detail.length > 0 && (
        <div className="card home-panel results-detail-panel">
          <h3 className="home-panel-title">Détail de la session</h3>
          <ol className="results-detail-list">
            {detail.map((q, i) => {
              const correctText =
                q.type === "buzzer"
                  ? q.answerText
                  : (q.options || [])
                      .filter((_, idx) => (q.correctOptions || []).includes(idx))
                      .join(", ");
              return (
                <li key={q.id} className="results-detail-item">
                  <p className="results-detail-question">
                    <span className="tag row gap">
                      {q.type === "buzzer" ? <Bell size={13} /> : <ListChecks size={13} />}
                      Question {i + 1}
                    </span>
                    <span className="tag tag-points row gap">
                      <Star size={13} />
                      {q.points} pts
                    </span>
                  </p>
                  <p className="results-detail-text">{q.text}</p>
                  <p className="results-detail-answer">
                    <CheckCircle2 size={15} />
                    {correctText || "Réponse non renseignée"}
                  </p>
                  <p className="results-detail-winner">
                    <UserCheck size={15} />
                    {q.winners.length > 0
                      ? q.winners.map((w) => `${w.name} (+${w.points} pts)`).join(", ")
                      : "Personne n'a trouvé"}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <Link className="muted link icon-link" to="/">
        <HomeIcon size={16} />
        Retour à l'accueil
      </Link>

      <Footer />
    </div>
  );
}
