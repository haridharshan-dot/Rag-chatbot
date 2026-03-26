import { useEffect, useMemo, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import ChatWidget from "./ChatWidget";
import {
  createSession,
  fetchStudentHistory,
  requestStudentForgotPasswordOtp,
  studentRegister,
  studentGoogleLogin,
  studentLogin,
  verifyStudentForgotPasswordOtp,
} from "../api";
import { clearStudentToken, getStudentFromToken, setStudentToken } from "../utils/auth";
import { trackChatFunnelEvent } from "../utils/chatAnalytics";

export default function EmbeddedStudentChatbot({
  studentId: providedStudentId,
  defaultOpen = false,
  hideFab = false,
  siteContext = null,
}) {
  const requiresPopupAuth = useMemo(() => !providedStudentId, [providedStudentId]);
  const initialStudent = useMemo(() => {
    if (providedStudentId) {
      return { id: providedStudentId, name: "Student", email: "" };
    }
    return getStudentFromToken();
  }, [providedStudentId]);

  const [student, setStudent] = useState(initialStudent);
  const [historyCount, setHistoryCount] = useState(0);
  const [historySessions, setHistorySessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(Boolean(initialStudent?.id));
  const [error, setError] = useState("");

  const [authMode, setAuthMode] = useState("login");
  const [showForgotFlow, setShowForgotFlow] = useState(false);
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupMobile, setSignupMobile] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [forgotMobile, setForgotMobile] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotOtpRequested, setForgotOtpRequested] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const googleEnabled = Boolean(String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim());

  useEffect(() => {
    if (!requiresPopupAuth) {
      setHistoryCount(0);
      return;
    }
    setHistoryCount(historySessions.length);
  }, [historySessions, requiresPopupAuth]);

  function getSessionIdValue(session) {
    return String(session?._id || session?.id || "").trim();
  }

  function buildSessionShell(session) {
    return {
      _id: session?._id || session?.id || "",
      id: session?.id || session?._id || "",
      status: session?.status || "bot",
      createdAt: session?.createdAt || new Date().toISOString(),
      updatedAt: session?.updatedAt || session?.createdAt || new Date().toISOString(),
      messages: Array.isArray(session?.messages) ? session.messages : [],
    };
  }

  function upsertHistorySession(session, options = {}) {
    const sessionRecord = buildSessionShell(session);
    const targetId = getSessionIdValue(sessionRecord);
    if (!targetId) return;

    setHistorySessions((prev) => {
      const filtered = prev.filter((item) => getSessionIdValue(item) !== targetId);
      const next = options.prepend === false ? [...filtered, sessionRecord] : [sessionRecord, ...filtered];
      return next.slice(0, 20);
    });
  }

  async function createNewChatSession() {
    if (!student?.id) return null;
    const session = await createSession(student.id, siteContext);
    const normalized = buildSessionShell(session);
    upsertHistorySession(normalized);
    setSessionId(getSessionIdValue(normalized));
    return normalized;
  }

  useEffect(() => {
    if (!student?.id) {
      setLoading(false);
      setSessionId("");
      setHistorySessions([]);
      return;
    }

    let mounted = true;

    async function bootstrapStudentChat() {
      setLoading(true);
      setError("");
      try {
        if (requiresPopupAuth) {
          const sessions = await fetchStudentHistory();
          if (!mounted) return;
          const normalizedSessions = Array.isArray(sessions) ? sessions.map(buildSessionShell) : [];
          setHistorySessions(normalizedSessions);

          if (normalizedSessions.length > 0) {
            setSessionId(getSessionIdValue(normalizedSessions[0]));
            return;
          }
        }

        const session = await createSession(student.id, siteContext);
        if (mounted) {
          const normalized = buildSessionShell(session);
          setHistorySessions(requiresPopupAuth ? [normalized] : []);
          setSessionId(getSessionIdValue(normalized));
        }
      } catch (error) {
        console.error("Failed to create chatbot session", error);
        if (mounted) {
          setSessionId("");
          setHistorySessions([]);
          setError("Unable to start chat session. Please retry.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    bootstrapStudentChat();
    return () => {
      mounted = false;
    };
  }, [requiresPopupAuth, siteContext, student?.id]);

  useEffect(() => {
    if (!requiresPopupAuth || student?.id) return;
    trackChatFunnelEvent("auth_start");
  }, [requiresPopupAuth, student?.id]);

  useEffect(() => {
    if (!sessionId || !student?.id) return;
    trackChatFunnelEvent("chat_started");
  }, [sessionId, student?.id]);

  function handleSwitchAccount() {
    clearStudentToken();
    setStudent(null);
    setHistoryCount(0);
    setHistorySessions([]);
    setSessionId("");
    setError("");
    setAuthError("");
    setAuthMessage("Signed out. Login to continue.");
    setForgotOtp("");
    setForgotOtpRequested(false);
    setAuthMode("login");
    setShowForgotFlow(false);
  }

  function resetAuthFeedback() {
    setAuthError("");
    setAuthMessage("");
  }

  async function handleSignup(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const data = await studentRegister({
        name: signupName,
        email: signupEmail,
        mobile: signupMobile,
        password: signupPassword,
      });
      setShowForgotFlow(false);
      if (!data?.token || !data?.user?.id) {
        throw new Error("Invalid signup response");
      }
      setStudentToken(data.token);
      setStudent({
        id: data.user.id,
        name: data.user.name || "Student",
        email: data.user.email || "",
      });
      trackChatFunnelEvent("auth_success");
      setAuthMessage("Signup successful. Starting your chat session...");
    } catch (signupError) {
      const message = signupError?.response?.data?.message || "Signup failed";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handlePasswordLogin(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const data = await studentLogin({
        email: loginEmail,
        password: loginPassword,
      });
      if (!data?.token || !data?.user?.id) {
        throw new Error("Invalid login response");
      }

      setStudentToken(data.token);
      setStudent({
        id: data.user.id,
        name: data.user.name || "Student",
        email: data.user.email || "",
      });
      trackChatFunnelEvent("auth_success");
      setAuthMessage("Login successful. Starting your chat session...");
      setLoginPassword("");
    } catch (loginError) {
      const message = loginError?.response?.data?.message || "Invalid credentials";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleForgotPasswordRequest(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const data = await requestStudentForgotPasswordOtp({ mobile: forgotMobile });
      setForgotOtpRequested(true);
      setAuthMessage("OTP sent to your mobile for password reset.");
    } catch (forgotError) {
      const message = forgotError?.response?.data?.message || "Could not send OTP";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleForgotPasswordVerify(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      await verifyStudentForgotPasswordOtp({
        mobile: forgotMobile,
        otp: forgotOtp,
        newPassword: forgotNewPassword,
      });
      setForgotOtp("");
      setForgotNewPassword("");
      setForgotOtpRequested(false);
      setShowForgotFlow(false);
      setAuthMessage("Password updated. Login using your email and new password.");
    } catch (forgotVerifyError) {
      const message = forgotVerifyError?.response?.data?.message || "Unable to reset password";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSuccess(response) {
    const credential = String(response?.credential || "").trim();
    if (!credential) {
      setAuthError("Google credential was not received.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const data = await studentGoogleLogin(credential);
      if (!data?.token || !data?.user?.id) {
        throw new Error("Invalid Google login response");
      }

      setStudentToken(data.token);
      setStudent({
        id: data.user.id,
        name: data.user.name || "Student",
        email: data.user.email || "",
      });
      trackChatFunnelEvent("auth_success");
      setAuthMessage("Google login successful. Starting your chat session...");
    } catch (googleError) {
      const message = googleError?.response?.data?.message || "Google login failed";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }

  const preChatContent =
    requiresPopupAuth && !student?.id
      ? ({ onClose }) => (
          <section className="cc-shell cc-auth-shell" aria-label="Student sign in">
            <div className="cc-auth-header">
              <div>
                <p className="cc-auth-eyebrow">SONA COLLEGE</p>
                <h3>AI ASSISTANT</h3>
                <p>Sign up or login to continue your chat. OTP is only for password reset.</p>
              </div>
              <button className="cc-auth-close" onClick={onClose} aria-label="Close chatbot">
                x
              </button>
            </div>

            <div className="cc-auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                className={`cc-auth-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("login");
                  setShowForgotFlow(false);
                  resetAuthFeedback();
                }}
                role="tab"
                aria-selected={authMode === "login"}
              >
                Login
              </button>
              <button
                className={`cc-auth-tab ${authMode === "signup" ? "active" : ""}`}
                onClick={() => {
                  setAuthMode("signup");
                  setShowForgotFlow(false);
                  resetAuthFeedback();
                }}
                role="tab"
                aria-selected={authMode === "signup"}
              >
                Signup
              </button>
            </div>

            <div className="cc-google-wrap">
              {googleEnabled ? (
                <>
                  <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setAuthError("Google login failed")} text="continue_with" shape="pill" />
                  <p className="cc-auth-note">Use Google for instant login or signup.</p>
                </>
              ) : (
                <p className="cc-auth-note">Google login/signup is unavailable right now.</p>
              )}
            </div>

            {authMode === "signup" ? (
              <form className="cc-auth-form" onSubmit={handleSignup}>
                <input
                  className="cc-auth-input"
                  placeholder="Full name"
                  value={signupName}
                  onChange={(event) => setSignupName(event.target.value)}
                  required
                />
                <input
                  className="cc-auth-input"
                  type="email"
                  placeholder="Email"
                  value={signupEmail}
                  onChange={(event) => setSignupEmail(event.target.value)}
                  required
                />
                <input
                  className="cc-auth-input"
                  placeholder="Mobile number"
                  value={signupMobile}
                  onChange={(event) => setSignupMobile(event.target.value)}
                  required
                />
                <input
                  className="cc-auth-input"
                  type="password"
                  placeholder="Create password"
                  value={signupPassword}
                  onChange={(event) => setSignupPassword(event.target.value)}
                  minLength={6}
                  required
                />
                <button className="cc-send cc-auth-cta" type="submit" disabled={authBusy}>
                  {authBusy ? "Creating account..." : "Signup"}
                </button>
              </form>
            ) : authMode === "login" ? (
              <>
                {!showForgotFlow ? (
                  <>
                    <form className="cc-auth-form" onSubmit={handlePasswordLogin}>
                      <input
                        className="cc-auth-input"
                        type="email"
                        placeholder="Enter your email"
                        value={loginEmail}
                        onChange={(event) => setLoginEmail(event.target.value)}
                        required
                      />
                      <input
                        className="cc-auth-input"
                        type="password"
                        placeholder="Enter password"
                        value={loginPassword}
                        onChange={(event) => setLoginPassword(event.target.value)}
                        required
                      />
                      <button className="cc-send cc-auth-cta" type="submit" disabled={authBusy}>
                        {authBusy ? "Signing in..." : "Login"}
                      </button>
                    </form>

                    <div className="cc-auth-inline-actions">
                      <button
                        type="button"
                        className="cc-link-btn"
                        onClick={() => {
                          setShowForgotFlow(true);
                          setForgotMobile("");
                          setForgotOtpRequested(false);
                          setForgotOtp("");
                          setForgotNewPassword("");
                          resetAuthFeedback();
                        }}
                      >
                        Forgot password? Reset with OTP
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="cc-auth-form">
                      <p className="cc-auth-subtitle">Reset password with OTP</p>
                    </div>

                    <form className="cc-auth-form" onSubmit={handleForgotPasswordRequest}>
                      <input
                        className="cc-auth-input"
                        placeholder="Enter registered mobile"
                        value={forgotMobile}
                        onChange={(event) => setForgotMobile(event.target.value)}
                        required
                      />
                      <button className="cc-send cc-auth-cta" type="submit" disabled={authBusy}>
                        {authBusy ? "Sending OTP..." : "Send Reset OTP"}
                      </button>
                    </form>

                    {forgotOtpRequested ? (
                      <form className="cc-auth-form cc-auth-verify" onSubmit={handleForgotPasswordVerify}>
                        <input
                          className="cc-auth-input"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="Enter OTP"
                          value={forgotOtp}
                          onChange={(event) => setForgotOtp(event.target.value)}
                          required
                        />
                        <input
                          className="cc-auth-input"
                          type="password"
                          minLength={6}
                          placeholder="Enter new password"
                          value={forgotNewPassword}
                          onChange={(event) => setForgotNewPassword(event.target.value)}
                          required
                        />
                        <button className="cc-send cc-auth-cta" type="submit" disabled={authBusy}>
                          {authBusy ? "Updating..." : "Verify OTP & Reset Password"}
                        </button>
                      </form>
                    ) : null}

                    <div className="cc-auth-inline-actions">
                      <button
                        type="button"
                        className="cc-link-btn"
                        onClick={() => {
                          setShowForgotFlow(false);
                          resetAuthFeedback();
                        }}
                      >
                        Back to Login
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              null
            )}

            {authMessage ? <p className="cc-auth-message">{authMessage}</p> : null}
            {authError ? <p className="cc-auth-error">{authError}</p> : null}
          </section>
        )
      : null;

  return (
    <ChatWidget
      sessionId={sessionId}
      studentId={student?.id || ""}
      loading={loading}
      error={error}
      preChatContent={preChatContent}
      chatContainerProps={{
        studentDisplayName: requiresPopupAuth ? student?.name || "Student" : "",
        historyCount: requiresPopupAuth ? historyCount : 0,
        historySessions: requiresPopupAuth ? historySessions : [],
        currentSessionId: sessionId,
        onSelectSession:
          requiresPopupAuth && student?.id
            ? (nextSessionId) => {
                setSessionId(String(nextSessionId || ""));
                setError("");
              }
            : null,
        onNewChat:
          requiresPopupAuth && student?.id
            ? async () => {
                setLoading(true);
                setError("");
                try {
                  await createNewChatSession();
                } catch (createError) {
                  console.error("Failed to create new chat session", createError);
                  setError("Unable to start a new chat right now.");
                } finally {
                  setLoading(false);
                }
              }
            : null,
        onSessionSnapshot:
          requiresPopupAuth && student?.id
            ? (session) => {
                upsertHistorySession(session);
              }
            : null,
        siteContext,
        onStudentLogout: requiresPopupAuth && student?.id ? handleSwitchAccount : null,
      }}
      onRetry={() => {
        if (!student?.id) return;
        setSessionId("");
        setError("");
        setLoading(true);
        createSession(student.id, siteContext)
          .then((session) => {
            const normalized = buildSessionShell(session);
            upsertHistorySession(normalized);
            setSessionId(getSessionIdValue(normalized));
          })
          .catch((retryError) => {
            console.error("Retry create session failed", retryError);
            setError("Unable to start chat session. Please retry.");
          })
          .finally(() => setLoading(false));
      }}
      defaultOpen={defaultOpen}
      hideFab={hideFab}
    />
  );
}
