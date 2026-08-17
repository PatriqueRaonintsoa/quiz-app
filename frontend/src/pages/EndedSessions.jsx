import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy } from "lucide-react";
import { api } from "../api.js";
import NavBar from "../components/NavBar.jsx";
import Footer from "../components/Footer.jsx";

export default function EndedSessions() {
  const [sessions, setSessions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.listSessions().then(setSessions);
  }, []);

  const endedSessions = sessions.filter((s) => s.status === "ended");

  return (
    <div className="page">
      <NavBar />

      <div className="results-list-header">
        <Trophy size={26} />
        <h1>Sessions terminées</h1>
      </div>
      <p className="subtitle">
        Consultez le classement final de vos sessions passées.
      </p>

      <div className="session-list">
        {endedSessions.length === 0 && (
          <p className="muted">Aucune session terminée pour le moment.</p>
        )}
        {endedSessions.map((s) => (
          <div
            key={s.id}
            className="session-card"
            onClick={() => navigate(`/session/${s.id}/results`)}
          >
            <span className="session-name">{s.name}</span>
            <span className="badge badge-ended">Terminée</span>
          </div>
        ))}
      </div>

      <Footer />
    </div>
  );
}
