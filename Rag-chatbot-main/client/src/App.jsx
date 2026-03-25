import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import StudentPage from "./pages/StudentPage";
import Dashboard from "./pages/Dashboard";
import StatusPage from "./pages/StatusPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminAgentsPage from "./pages/AdminAgentsPage";
import ChatbotEmbedPage from "./pages/ChatbotEmbedPage";
import Login from "./pages/Login";
import { isAgentAuthenticated } from "./utils/auth";

function ProtectedRoute({ children }) {
  if (!isAgentAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  const location = useLocation();
  const isEmbedRoute = location.pathname === "/chatbot";

  return (
    <div className="app-shell">
      {!isEmbedRoute && (
        <header className="top-nav">
          <h1>College Concierge</h1>
        </header>
      )}
      <Routes>
        <Route path="/" element={<StudentPage />} />
        <Route path="/chatbot" element={<ChatbotEmbedPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/agent" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={(
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/admin"
          element={(
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/admin/users"
          element={(
            <ProtectedRoute>
              <AdminUsersPage />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/admin/agents"
          element={(
            <ProtectedRoute>
              <AdminAgentsPage />
            </ProtectedRoute>
          )}
        />
      </Routes>
    </div>
  );
}

export default App;
