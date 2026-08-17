import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import logo from "../assets/meeabo-logo.png";
import NavBar from "../components/NavBar.jsx";
import Footer from "../components/Footer.jsx";

export default function Home() {
  const [sessions, setSessions] = useState([]);
  const [view, setView] = useState(null); // null | "create" | "join"
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

  function toggleView(next) {
    setError("");
    setView((current) => (current === next ? null : next));
  }

  // Les sessions terminées ne sont plus proposées ici : elles ont leur
  // propre page de résultats, accessible depuis leur lien direct.
  const joinableSessions = sessions.filter((s) => s.status !== "ended");

  return (
    <div className="page home-page">
      <NavBar />
      <div className="home-hero">
        <img src={logo} alt="Meeabo" className="home-logo" />
        <p className="home-description">
          Organisez des sessions de "Questions pour un champion" en temps
          réel : buzzer, QCM ou mode mixte, classement en direct et écran
          public pour vos événements.
        </p>

        <div className="home-actions">
          <button
            className={`btn btn-primary btn-lg ${view === "create" ? "active" : ""}`}
            onClick={() => toggleView("create")}
          >
            Créer une session
          </button>
          <button
            className={`btn btn-secondary btn-lg ${view === "join" ? "active" : ""}`}
            onClick={() => toggleView("join")}
          >
            Ouvrir une session
          </button>
        </div>
      </div>

      {view === "create" && (
        <form className="card form home-panel" onSubmit={handleCreate}>
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
            <button type="submit" className="btn btn-primary">
              Créer
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setView(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {view === "join" && (
        <div className="card home-panel">
          <h3 className="home-panel-title">Sessions disponibles</h3>
          <div className="session-list">
            {joinableSessions.length === 0 && (
              <p className="muted">Aucune session pour le moment.</p>
            )}
            {joinableSessions.map((s) => (
              <div
                key={s.id}
                className="session-card"
                onClick={() => navigate(`/session/${s.id}`)}
              >
                <span className="session-name">{s.name}</span>
                <span className={`badge badge-${s.status}`}>
                  {s.status === "waiting" && "En attente"}
                  {s.status === "started" && "En cours"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
