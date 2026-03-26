import { useEffect, useMemo, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Link } from "react-router-dom";
import EmbeddedStudentChatbot from "../components/EmbeddedStudentChatbot";
import {
  fetchStudentHistory,
  fetchStudentMe,
  requestStudentOtp,
  setStudentToken,
  studentGoogleLogin,
  studentLogin,
  studentSignup,
  verifyStudentOtp,
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
  const [loginMethod, setLoginMethod] = useState("password");
  const [otpChannel, setOtpChannel] = useState("mobile");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [debugOtp, setDebugOtp] = useState("");
  const [student, setStudent] = useState(() => getStudentFromToken());
  const [history, setHistory] = useState([]);
  const googleEnabled = Boolean(String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim());

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

  function applyLoginResult(data, successMessage = "Signed in successfully.") {
    setStudentToken(data.token);
    setStudent(data.user);
    setSuccess(successMessage);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setDebugOtp("");
    try {
      let data;
      if (tab === "register") {
        data = await studentSignup({
          name: String(name || "").trim(),
          email: String(email || "").trim().toLowerCase(),
          mobile: String(mobile || "").trim(),
          password: String(password || "").trim(),
        });
        setLoginMethod("otp");
        setOtpChannel("mobile");
        setSuccess("Signup complete. OTP sent to your mobile. You can also login with password.");
        if (data?.otp) {
          setDebugOtp(data.otp);
        }
        return;
      }

      if (loginMethod === "password") {
        data = await studentLogin({
          email: String(email || "").trim().toLowerCase(),
          password: String(password || "").trim(),
        });
        applyLoginResult(data);
      } else {
        data = await verifyStudentOtp({
          channel: otpChannel,
          email: otpChannel === "email" ? String(email || "").trim().toLowerCase() : "",
          mobile: otpChannel === "mobile" ? String(mobile || "").trim() : "",
          otp: String(otp || "").trim(),
        });
        applyLoginResult(data, "OTP verified. Signed in successfully.");
        setOtp("");
      }

      setPassword("");
      const sessions = await fetchStudentHistory();
      setHistory(Array.isArray(sessions) ? sessions : []);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to authenticate right now.");
    } finally {
      setLoading(false);
    }
  }

  async function onRequestOtp() {
    setLoading(true);
    setError("");
    setSuccess("");
    setDebugOtp("");
    try {
      const payload =
        otpChannel === "mobile"
          ? { channel: "mobile", mobile: String(mobile || "").trim() }
          : { channel: "email", email: String(email || "").trim().toLowerCase() };
      const data = await requestStudentOtp(payload);
      setSuccess(`OTP sent to your ${otpChannel}.`);
      if (data?.otp) {
        setDebugOtp(data.otp);
      }
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Could not send OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleSuccess(response) {
    const credential = String(response?.credential || "").trim();
    if (!credential) {
      setError("Google credential was not received.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await studentGoogleLogin(credential);
      applyLoginResult(data, "Google login successful.");
      const sessions = await fetchStudentHistory();
      setHistory(Array.isArray(sessions) ? sessions : []);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Google login failed.");
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
    setOtp("");
    setDebugOtp("");
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
                  setDebugOtp("");
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
                  setDebugOtp("");
                }}
              >
                Register
              </button>
            </div>

            {tab === "login" ? (
              <div className="student-auth-method-toggle">
                <button
                  type="button"
                  className={loginMethod === "password" ? "active" : ""}
                  onClick={() => setLoginMethod("password")}
                >
                  Password Login
                </button>
                <button
                  type="button"
                  className={loginMethod === "otp" ? "active" : ""}
                  onClick={() => setLoginMethod("otp")}
                >
                  OTP Login
                </button>
              </div>
            ) : null}

            <div className="student-google-wrap">
              {googleEnabled ? (
                <>
                  <GoogleLogin
                    onSuccess={onGoogleSuccess}
                    onError={() => setError("Google login failed.")}
                    text="continue_with"
                  />
                  <p className="student-auth-note">Use Google for instant login or signup.</p>
                </>
              ) : (
                <p className="student-auth-note">
                  Google login/signup is unavailable. Configure `VITE_GOOGLE_CLIENT_ID`.
                </p>
              )}
            </div>

            <form className="student-auth-form" onSubmit={onSubmit}>
              {tab === "register" ? (
                <>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <input
                    placeholder="Mobile number"
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value)}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Create password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={6}
                    required
                  />
                </>
              ) : null}

              {tab === "login" && loginMethod === "password" ? (
                <>
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
                </>
              ) : null}

              {tab === "login" && loginMethod === "otp" ? (
                <>
                  <div className="student-auth-method-toggle">
                    <button
                      type="button"
                      className={otpChannel === "mobile" ? "active" : ""}
                      onClick={() => setOtpChannel("mobile")}
                    >
                      Mobile OTP
                    </button>
                    <button
                      type="button"
                      className={otpChannel === "email" ? "active" : ""}
                      onClick={() => setOtpChannel("email")}
                    >
                      Email OTP
                    </button>
                  </div>
                  {otpChannel === "mobile" ? (
                    <input
                      placeholder="Enter mobile"
                      value={mobile}
                      onChange={(event) => setMobile(event.target.value)}
                      required
                    />
                  ) : (
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  )}
                  <button type="button" className="student-secondary-btn" onClick={onRequestOtp} disabled={loading}>
                    {loading ? "Sending OTP..." : "Send OTP"}
                  </button>
                  <input
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    required
                  />
                </>
              ) : null}

              {error ? <p className="agent-error">{error}</p> : null}
              {success ? <p className="admin-feedback">{success}</p> : null}
              {debugOtp ? <p className="student-dev-otp">Dev OTP: {debugOtp}</p> : null}
              <button type="submit" disabled={loading}>
                {loading
                  ? "Please wait..."
                  : tab === "register"
                    ? "Create account"
                    : loginMethod === "otp"
                      ? "Verify OTP & Login"
                      : "Login"}
              </button>
            </form>

            {tab === "login" && loginMethod === "password" ? (
              <Link to="/forgot-password" className="student-link-btn">
                Forgot password? Reset with OTP
              </Link>
            ) : null}
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
