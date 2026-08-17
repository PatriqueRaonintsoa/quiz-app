import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import SessionLanding from "./pages/SessionLanding.jsx";
import JuryPanel from "./pages/JuryPanel.jsx";
import PlayerPage from "./pages/PlayerPage.jsx";
import PublicScreen from "./pages/PublicScreen.jsx";
import SessionResults from "./pages/SessionResults.jsx";
import EndedSessions from "./pages/EndedSessions.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/results" element={<EndedSessions />} />
      <Route path="/session/:id" element={<SessionLanding />} />
      <Route path="/session/:id/jury" element={<JuryPanel />} />
      <Route path="/session/:id/play" element={<PlayerPage />} />
      <Route path="/session/:id/public" element={<PublicScreen />} />
      <Route path="/session/:id/results" element={<SessionResults />} />
    </Routes>
  );
}
