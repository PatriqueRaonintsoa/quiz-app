import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, getDeviceId } from "../api.js";

export default function SessionLanding() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [juryCode, setJuryCode] = useState("");
  const [juryError, setJuryError] = useState("");

  const [playerName, setPlayerName] = useState("");
  const [playerError, setPlayerError] = useState("");
  const [checkingReturning, setCheckingReturning] = useState(true);

  useEffect(() => {
    api
      .getSession(id)
      .then(setSession)
      .catch(() => setNotFound(true));
  }, [id]);

  // Si ce device a déjà un joueur enregistré pour cette session -> redirection directe
  useEffect(() => {
    const deviceId = getDeviceId();
    api
      .getMyPlayer(id, deviceId)
      .then(() => navigate(`/session/${id}/play`))
      .catch(() => setCheckingReturning(false));
  }, [id, navigate]);

  async function handleJurySubmit(e) {
    e.preventDefault();
    setJuryError("");
    try {
      const { ok } = await api.verifyCode(id, juryCode);
      if (!ok) return setJuryError("Code incorrect");
      sessionStorage.setItem(`jury_code_${id}`, juryCode);
      navigate(`/session/${id}/jury`);
    } catch (err) {
      setJuryError(err.message);
    }
  }

  async function handlePlaySubmit(e) {
    e.preventDefault();
    setPlayerError("");
    try {
      const deviceId = getDeviceId();
      await api.joinAsPlayer(id, playerName, deviceId);
      navigate(`/session/${id}/play`);
    } catch (err) {
      setPlayerError(err.message);
    }
  }

  if (notFound) return <div className="page center"><p>Session introuvable.</p><Link to="/">Retour à l'accueil</Link></div>;
  if (!session || checkingReturning) return <div className="page center"><p>Chargement...</p></div>;

  return (
    <div className="page center">
      <h1>{session.name}</h1>
      <p className="subtitle">Choisissez votre rôle</p>

      <div className="two-blocks">
        <form className="card form" onSubmit={handleJurySubmit}>
          <h3>👨‍⚖️ Jury</h3>
          <p className="muted">Entrez le code secret pour piloter la session.</p>
          <input
            type="password"
            placeholder="Code de session"
            value={juryCode}
            onChange={(e) => setJuryCode(e.target.value)}
            required
          />
          {juryError && <p className="error">{juryError}</p>}
          <button type="submit" className="btn btn-secondary">Accéder à l'espace jury</button>
        </form>

        <form className="card form" onSubmit={handlePlaySubmit}>
          <h3>🎮 Jouer</h3>
          <p className="muted">Entrez votre nom pour participer.</p>
          <input
            type="text"
            placeholder="Votre nom"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            required
          />
          {playerError && <p className="error">{playerError}</p>}
          <button type="submit" className="btn btn-primary">Rejoindre la partie</button>
        </form>
      </div>

      <Link className="muted link" to={`/session/${id}/public`}>📺 Ouvrir l'écran public</Link>
    </div>
  );
}
