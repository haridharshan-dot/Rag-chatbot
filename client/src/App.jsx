import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isAgentAuthenticated } from "./utils/auth";

const StudentPage = lazy(() => import("./pages/StudentPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminAgentsPage = lazy(() => import("./pages/AdminAgentsPage"));
const ChatbotEmbedPage = lazy(() => import("./pages/ChatbotEmbedPage"));
const Login = lazy(() => import("./pages/Login"));

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
      <Suspense fallback={<div className="app-route-loading" role="status" aria-live="polite">Loading...</div>}>
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
      </Suspense>
    </div>
  );
}

export default App;
