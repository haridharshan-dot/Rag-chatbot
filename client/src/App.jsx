import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isAdminAuthenticated, isSupportAgentAuthenticated } from "./utils/auth";

const StudentPage = lazy(() => import("./pages/StudentPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminAgentsPage = lazy(() => import("./pages/AdminAgentsPage"));
const ChatbotEmbedPage = lazy(() => import("./pages/ChatbotEmbedPage"));
const Login = lazy(() => import("./pages/Login"));

function ProtectedRoute({ children }) {
  if (!isSupportAgentAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function App() {
  const location = useLocation();
  const isEmbedRoute = location.pathname === "/chatbot";
  const topNavTitle = location.pathname.startsWith("/admin")
    ? "ADMIN DASHBOARD"
    : "College Concierge";

  return (
    <div className="app-shell">
      {!isEmbedRoute && (
        <header className="top-nav">
          <h1>{topNavTitle}</h1>
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
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            )}
          />
          <Route
            path="/admin/users"
            element={(
              <AdminRoute>
                <AdminUsersPage />
              </AdminRoute>
            )}
          />
          <Route
            path="/admin/agents"
            element={(
              <AdminRoute>
                <AdminAgentsPage />
              </AdminRoute>
            )}
          />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
