import { useEffect, useMemo, useState } from "react";
import EmbeddedStudentChatbot from "../components/EmbeddedStudentChatbot";
import {
  fetchStudentHistory,
  fetchStudentMe,
  setStudentToken,
  studentLogin,
  studentRegister,
} from "../api";
import {
  clearStudentToken,
  getStudentFromToken,
  isStudentAuthenticated,
} from "../utils/auth";

function formatDate(dateLike) {
  if (!dateLike) return "-";
  return new Date(dateLike).toLocaleString();
}

export default function StudentPage() {
  const [tab, setTab] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [student, setStudent] = useState(() => getStudentFromToken());
  const [history, setHistory] = useState([]);

  const authenticated = useMemo(() => isStudentAuthenticated() && Boolean(student?.id), [student]);

  useEffect(() => {
    if (!authenticated) return;

    let mounted = true;
    Promise.all([fetchStudentMe(), fetchStudentHistory()])
      .then(([me, sessions]) => {
        if (!mounted) return;
        setStudent({
          id: me.id,
          email: me.email,
          name: me.name,
        });
        setHistory(Array.isArray(sessions) ? sessions : []);
      })
      .catch(() => {
        if (!mounted) return;
        clearStudentToken();
        setStudent(null);
        setHistory([]);
      });

    return () => {
      mounted = false;
    };
  }, [authenticated]);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      let data;
      if (tab === "register") {
        data = await studentRegister({
          name: String(name || "").trim(),
          email: String(email || "").trim().toLowerCase(),
          password: String(password || "").trim(),
        });
      } else {
        data = await studentLogin({
          email: String(email || "").trim().toLowerCase(),
          password: String(password || "").trim(),
        });
      }

      setStudentToken(data.token);
      setStudent(data.user);
      setSuccess("Signed in successfully.");
      setPassword("");
      const sessions = await fetchStudentHistory();
      setHistory(Array.isArray(sessions) ? sessions : []);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to authenticate right now.");
    } finally {
      setLoading(false);
    }
  }

  function onLogout() {
    clearStudentToken();
    setStudent(null);
    setHistory([]);
    setSuccess("");
    setError("");
    setPassword("");
  }

  return (
    <div className="student-page">
      <section className="hero-card">
        <p className="eyebrow">Student Portal</p>
        <h2>College Admission Assistant</h2>
        <p>
          Ask about eligibility, fee details, cutoffs, course options, and deadlines.
          The AI assistant answers from your college dataset and can connect you with
          a live support agent when needed.
        </p>
      </section>

      {!authenticated ? (
        <section className="student-auth-shell">
          <aside className="student-auth-intro">
            <p className="eyebrow">Secure Access</p>
            <h3>Sign in to keep your chat history</h3>
            <p>
              Login once and continue your conversations later. Agents can identify and
              respond to your exact session faster.
            </p>
            <ul className="student-auth-points">
              <li>Personal chat history</li>
              <li>Faster live agent support</li>
              <li>Session continuity across visits</li>
            </ul>
          </aside>

          <div className="student-auth-card">
            <div className="student-auth-tabs">
              <button
                type="button"
                className={tab === "login" ? "active" : ""}
                onClick={() => {
                  setTab("login");
                  setError("");
                  setSuccess("");
                }}
              >
                Login
              </button>
              <button
                type="button"
                className={tab === "register" ? "active" : ""}
                onClick={() => {
                  setTab("register");
                  setError("");
                  setSuccess("");
                }}
              >
                Register
              </button>
            </div>

            <form className="student-auth-form" onSubmit={onSubmit}>
              {tab === "register" ? (
                <input
                  type="text"
                  placeholder="Full name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              ) : null}
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              {error ? <p className="agent-error">{error}</p> : null}
              {success ? <p className="admin-feedback">{success}</p> : null}
              <button type="submit" disabled={loading}>
                {loading ? "Please wait..." : tab === "register" ? "Create account" : "Login"}
              </button>
            </form>
          </div>
        </section>
      ) : (
        <section className="student-session-card">
          <div>
            <p className="eyebrow">Signed in</p>
            <h3>{student?.name || "Student"}</h3>
            <p>{student?.email}</p>
          </div>
          <button className="ghost-btn" onClick={onLogout}>Logout</button>
        </section>
      )}

      {authenticated ? (
        <section className="student-history-card">
          <h4>Recent chat sessions</h4>
          {history.length === 0 ? (
            <p>No chat sessions yet.</p>
          ) : (
            <div className="student-history-list">
              {history.slice(0, 6).map((session) => (
                <article key={session._id || session.id} className="student-history-item">
                  <strong>Session {(session._id || session.id || "").slice(-6)}</strong>
                  <span>Status: {session.status}</span>
                  <small>Updated: {formatDate(session.updatedAt)}</small>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <EmbeddedStudentChatbot
        key={student?.id || "guest"}
        studentId={student?.id || undefined}
        defaultOpen={authenticated}
      />
    </div>
  );
}
