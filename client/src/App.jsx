import { Route, Routes, useNavigate } from "react-router-dom";
import StudentPage from "./pages/StudentPage";
import AgentDashboard from "./pages/AgentDashboard";
import StatusPage from "./pages/StatusPage";

function App() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="top-nav">
        <h1 onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
          College Concierge
        </h1>
        <nav className="top-nav-links">
          <button onClick={() => navigate("/")} className="nav-link">
            Chat
          </button>
          <button onClick={() => navigate("/status")} className="nav-link">
            Status
          </button>
          <button onClick={() => navigate("/agent")} className="nav-link">
            Agent
          </button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<StudentPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/agent" element={<AgentDashboard />} />
      </Routes>
    </div>
  );
}

export default App;
