import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ShieldCheck, Gamepad2, Tv } from "lucide-react";
import { api, getDeviceId } from "../api.js";
import LoadingScreen from "../components/LoadingScreen.jsx";
import NavBar from "../components/NavBar.jsx";
import Footer from "../components/Footer.jsx";

export default function SessionLanding() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [hasPlayer, setHasPlayer] = useState(false); // ce device a-t-il déjà rejoint cette session ?
  const [view, setView] = useState(null); // null | "jury" | "play"

  const [juryCode, setJuryCode] = useState("");
  const [juryError, setJuryError] = useState("");

  const [playerName, setPlayerName] = useState("");
  const [playerError, setPlayerError] = useState("");
  const [joinBlockedMessage, setJoinBlockedMessage] = useState("");

  useEffect(() => {
    api
      .getSession(id)
      .then(setSession)
      .catch(() => setNotFound(true));
  }, [id]);

  // Une session terminée n'a plus de choix Jury/Jouer : on va directement
  // sur sa page de résultats.
  useEffect(() => {
    if (session?.status === "ended") {
      navigate(`/session/${id}/results`, { replace: true });
    }
  }, [session, id, navigate]);

  // Sait si ce device a déjà un joueur enregistré pour cette session, sans
  // jamais rediriger automatiquement : l'utilisateur choisit toujours
  // lui-même où il veut aller depuis cette page.
  useEffect(() => {
    const deviceId = getDeviceId();
    api
      .getMyPlayer(id, deviceId)
      .then(() => setHasPlayer(true))
      .catch(() => setHasPlayer(false));
  }, [id]);

  function toggleView(next) {
    setJuryError("");
    setPlayerError("");
    setView((current) => (current === next ? null : next));
  }

  // Une fois la session lancée, plus aucun nouveau joueur ne peut s'inscrire
  // (ça fausserait le classement/la banque déjà en cours). Les joueurs déjà
  // inscrits avant le démarrage peuvent en revanche toujours revenir sur
  // leur page.
  const sessionInProgress = session?.status === "started" || session?.status === "paused";
  const joinLocked = sessionInProgress && !hasPlayer;

  function handlePlayClick() {
    if (hasPlayer) {
      // Déjà inscrit sur cet appareil : pas besoin de redemander le nom.
      navigate(`/session/${id}/play`);
      return;
    }
    if (joinLocked) {
      setJoinBlockedMessage(
        "Session en cours, vous ne pouvez pas rejoindre pour le moment. Revenez une fois que cette session sera terminée."
      );
      return;
    }
    setJoinBlockedMessage("");
    toggleView("play");
  }

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

  if (notFound)
    return (
      <div className="page center">
        <NavBar />
        <p>Session introuvable.</p>
        <Link to="/">Retour à l'accueil</Link>
      </div>
    );

  if (!session || session.status === "ended") return <LoadingScreen />;

  return (
    <div className="page home-page">
      <NavBar />
      <div className="home-hero">
        <h1>{session.name}</h1>
        <p className="home-description">
          Choisissez votre rôle pour rejoindre cette session.
        </p>

        <div className="home-actions">
          <button
            className={`btn btn-secondary btn-lg btn-icon ${view === "jury" ? "active" : ""}`}
            onClick={() => toggleView("jury")}
          >
            <ShieldCheck size={20} />
            Se connecter en tant que jury
          </button>
          <button
            className={`btn btn-primary btn-lg btn-icon ${view === "play" ? "active" : ""} ${
              joinLocked ? "btn-locked" : ""
            }`}
            title={joinLocked ? "Session en cours, inscription indisponible" : undefined}
            onClick={handlePlayClick}
          >
            <Gamepad2 size={20} />
            Jouer
          </button>
        </div>

        {joinBlockedMessage && <p className="error">{joinBlockedMessage}</p>}
      </div>

      {view === "jury" && (
        <form className="card form home-panel" onSubmit={handleJurySubmit}>
          <h3>Espace jury</h3>
          <p className="muted">Entrez le code secret pour piloter la session.</p>
          <label>Code de session</label>
          <input
            type="password"
            placeholder="Code secret"
            value={juryCode}
            onChange={(e) => setJuryCode(e.target.value)}
            required
          />
          {juryError && <p className="error">{juryError}</p>}
          <div className="row gap">
            <button type="submit" className="btn btn-secondary">
              Accéder à l'espace jury
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setView(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {view === "play" && (
        <form className="card form home-panel" onSubmit={handlePlaySubmit}>
          <h3>Rejoindre la partie</h3>
          <p className="muted">Entrez votre nom pour participer.</p>
          <label>Votre nom</label>
          <input
            type="text"
            placeholder="Ex: Rina"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            required
          />
          {playerError && <p className="error">{playerError}</p>}
          <div className="row gap">
            <button type="submit" className="btn btn-primary">
              Rejoindre la partie
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setView(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      <Link className="muted link icon-link" to={`/session/${id}/public`}>
        <Tv size={16} />
        Ouvrir l'écran public
      </Link>

      <Footer />
    </div>
  );
}
