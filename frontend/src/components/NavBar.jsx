import { Link } from "react-router-dom";
import logo from "../assets/meeabo-logo.png";

export default function NavBar({ showResults = true }) {
  return (
    <nav className="top-nav">
      <Link to="/" className="top-nav-brand">
        <img src={logo} alt="Meeabo" className="top-nav-logo" />
        <span className="top-nav-text">
          <span className="top-nav-title">Meeabo</span>
          <span className="top-nav-tagline">Grow Your Value</span>
        </span>
      </Link>
      {showResults && (
        <Link to="/results" className="top-nav-results">
          Results
        </Link>
      )}
    </nav>
  );
}
