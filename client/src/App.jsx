import { Route, Routes } from "react-router-dom";
import StudentPage from "./pages/StudentPage";
import AgentDashboard from "./pages/AgentDashboard";
import StatusPage from "./pages/StatusPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminAgentsPage from "./pages/AdminAgentsPage";

function App() {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <h1>College Concierge</h1>
      </header>
      <Routes>
        <Route path="/" element={<StudentPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/agent" element={<AgentDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/agents" element={<AdminAgentsPage />} />
      </Routes>
    </div>
  );
}

export default App;
