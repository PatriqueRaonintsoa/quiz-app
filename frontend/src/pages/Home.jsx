import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export default function Home() {
  const [sessions, setSessions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function load() {
    const rows = await api.listSessions();
    setSessions(rows);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      const session = await api.createSession(name, code);
      navigate(`/session/${session.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page center">
      <h1>🏆 Questions pour un champion</h1>
      <p className="subtitle">Sessions de jeu en cours</p>

      <div className="session-list">
        {sessions.length === 0 && <p className="muted">Aucune session pour le moment.</p>}
        {sessions.map((s) => (
          <div
            key={s.id}
            className="session-card"
            onClick={() => navigate(`/session/${s.id}`)}
          >
            <span className="session-name">{s.name}</span>
            <span className={`badge badge-${s.status}`}>
              {s.status === "waiting" && "En attente"}
              {s.status === "started" && "En cours"}
              {s.status === "ended" && "Terminée"}
            </span>
          </div>
        ))}
      </div>

      {!showCreate ? (
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Créer une nouvelle session (Jury)
        </button>
      ) : (
        <form className="card form" onSubmit={handleCreate}>
          <h3>Créer une session</h3>
          <label>Nom de la session</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Finale régionale"
            required
          />
          <label>Code secret de la session (jury)</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ex: CHAMP2026"
            required
          />
          {error && <p className="error">{error}</p>}
          <div className="row gap">
            <button type="submit" className="btn btn-primary">Créer</button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
