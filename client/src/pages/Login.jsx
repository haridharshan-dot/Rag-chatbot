import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin, agentLogin, agentMicrosoftLogin } from "../api";
import { getMicrosoftAuthState, signInWithMicrosoft } from "../auth/microsoftAuth";
import { getAgentRole, isAgentAuthenticated, setAgentToken } from "../utils/auth";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("agent");
  const [email, setEmail] = useState("agent@sona.com");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const microsoftAuth = useMemo(() => getMicrosoftAuthState(), []);

  useEffect(() => {
    if (isAgentAuthenticated()) {
      const role = getAgentRole();
      navigate(role === "admin" ? "/admin" : "/dashboard", { replace: true });
    }
  }, [navigate]);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    const trimmedEmail = String(email || "").trim().toLowerCase();
    const trimmedPassword = String(password || "").trim();
    if (!trimmedEmail || !trimmedPassword) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);

    try {
      const data = mode === "admin"
        ? await adminLogin(trimmedEmail, trimmedPassword)
        : await agentLogin(trimmedEmail, trimmedPassword);
      setAgentToken(data.token, { remember });
      setSuccessMessage("Login successful. Redirecting...");
      navigate(mode === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  async function onMicrosoftLogin() {
    setError("");
    setSuccessMessage("");
    if (!microsoftAuth.configured) {
      setError(microsoftAuth.message);
      return;
    }
    setMicrosoftLoading(true);
    try {
      const microsoft = await signInWithMicrosoft();
      const data = await agentMicrosoftLogin(microsoft.accessToken);
      setAgentToken(data.token, { remember: true });
      setSuccessMessage("Microsoft sign-in successful. Redirecting...");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Microsoft sign-in failed");
    } finally {
      setMicrosoftLoading(false);
    }
  }

  return (
    <div className="agent-auth-wrap">
      <section className="agent-auth-card modern-auth-card">
        <aside className="auth-visual-panel">
          <div className="auth-visual-top">
            <img src="/sonalogo.png" alt="Sona logo" className="agent-auth-logo" />
            <span>Sona AI Desk</span>
          </div>
          <div className="auth-visual-illustration" aria-hidden="true">
            <div className="shape shape-main" />
            <div className="shape shape-orbit" />
            <div className="shape shape-dot" />
          </div>
          <h3>Secure Agent Login</h3>
          <p>Use your authorized support account to access live student conversations.</p>
        </aside>

        <div className="auth-form-panel">
          <div className="agent-auth-brand">
            <img src="/sonalogo.png" alt="Sona logo" className="agent-auth-logo" />
            <div>
              <p className="eyebrow">Support Access</p>
              <h2>{mode === "admin" ? "Admin Sign In" : "Agent Sign In"}</h2>
            </div>
          </div>

          <div className="student-auth-tabs">
            <button
              type="button"
              className={mode === "agent" ? "active" : ""}
              onClick={() => {
                setMode("agent");
                setEmail("agent@sona.com");
                setError("");
                setSuccessMessage("");
              }}
            >
              Agent
            </button>
            <button
              type="button"
              className={mode === "admin" ? "active" : ""}
              onClick={() => {
                setMode("admin");
                setEmail("admin@sona.com");
                setError("");
                setSuccessMessage("");
              }}
            >
              Admin
            </button>
          </div>

          {mode === "agent" && (
            <>
              <button
                type="button"
                className="ms-login-btn"
                onClick={onMicrosoftLogin}
                disabled={microsoftLoading || !microsoftAuth.configured}
                title={!microsoftAuth.configured ? "Microsoft login not configured" : "Continue with Microsoft"}
              >
                <span className="ms-icon" aria-hidden="true">
                  <span className="ms-square ms-red" />
                  <span className="ms-square ms-green" />
                  <span className="ms-square ms-blue" />
                  <span className="ms-square ms-yellow" />
                </span>
                <span>{microsoftLoading ? "Signing in..." : "Continue with Microsoft"}</span>
              </button>
              {!microsoftAuth.configured ? (
                <p className="auth-footnote">Microsoft login not configured</p>
              ) : null}

              <p className="agent-auth-divider">or continue with email and password</p>
            </>
          )}

          <form onSubmit={onSubmit} className="agent-auth-form">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="agent@sona.com"
              autoComplete="email"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
            />

            <label className="admin-checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>

            {error ? <p className="agent-error">{error}</p> : null}
            {successMessage ? <p className="admin-feedback">{successMessage}</p> : null}
            <button type="submit" disabled={loading}>{loading ? "Signing in..." : "Login"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
