import logo from "../assets/meeabo-logo.png";

export default function LoadingScreen({ label = "Chargement..." }) {
  return (
    <div className="page center loading-screen">
      <img src={logo} alt="Chargement" className="pulse-logo" />
      {label && <p className="muted">{label}</p>}
    </div>
  );
}
