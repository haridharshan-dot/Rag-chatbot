import { useEffect, useMemo, useState } from "react";
import ChatWidget from "./ChatWidget";
import {
  createSession,
  requestStudentOtp,
  studentSignup,
  verifyStudentOtp,
} from "../api";
import { getStudentFromToken, setStudentToken } from "../utils/auth";

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
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(Boolean(initialStudent?.id));
  const [error, setError] = useState("");

  const [authMode, setAuthMode] = useState("login");
  const [otpChannel, setOtpChannel] = useState("email");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupMobile, setSignupMobile] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginMobile, setLoginMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [debugOtp, setDebugOtp] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (!student?.id) {
      setLoading(false);
      setSessionId("");
      return;
    }

    let mounted = true;

    async function startSession() {
      setLoading(true);
      setError("");
      try {
        const session = await createSession(student.id, siteContext);
        if (mounted) {
          setSessionId(session._id || session.id);
        }
      } catch (error) {
        console.error("Failed to create chatbot session", error);
        if (mounted) {
          setSessionId("");
          setError("Unable to start chat session. Please retry.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    startSession();
    return () => {
      mounted = false;
    };
  }, [siteContext, student?.id]);

  async function handleSignup(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    setDebugOtp("");
    try {
      const data = await studentSignup({
        name: signupName,
        email: signupEmail,
        mobile: signupMobile,
      });
      setAuthMode("login");
      setOtpChannel("email");
      setLoginEmail(signupEmail.trim().toLowerCase());
      setAuthMessage("Signup successful. OTP sent to your email.");
      if (data?.otp) {
        setDebugOtp(data.otp);
      }
    } catch (signupError) {
      const message = signupError?.response?.data?.message || "Signup failed";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRequestOtp(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    setDebugOtp("");
    try {
      const payload =
        otpChannel === "email"
          ? { channel: "email", email: loginEmail }
          : { channel: "mobile", mobile: loginMobile };
      const data = await requestStudentOtp(payload);
      setAuthMessage(`OTP sent to your ${otpChannel}.`);
      if (data?.otp) {
        setDebugOtp(data.otp);
      }
    } catch (otpError) {
      const message = otpError?.response?.data?.message || "Could not send OTP";
      setAuthError(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const payload =
        otpChannel === "email"
          ? { channel: "email", email: loginEmail, otp }
          : { channel: "mobile", mobile: loginMobile, otp };

      const data = await verifyStudentOtp(payload);
      if (!data?.token || !data?.user?.id) {
        throw new Error("Invalid verification response");
      }

      setStudentToken(data.token);
      setStudent({
        id: data.user.id,
        name: data.user.name || "Student",
        email: data.user.email || "",
      });
      setAuthMessage("Login successful. Starting your chat session...");
      setOtp("");
    } catch (verifyError) {
      const message = verifyError?.response?.data?.message || "Invalid OTP";
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
                <p>Sign up or login with OTP to continue your chat.</p>
              </div>
              <button className="cc-auth-close" onClick={onClose} aria-label="Close chatbot">
                x
              </button>
            </div>

            <div className="cc-auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                className={`cc-auth-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => setAuthMode("login")}
                role="tab"
                aria-selected={authMode === "login"}
              >
                Login with OTP
              </button>
              <button
                className={`cc-auth-tab ${authMode === "signup" ? "active" : ""}`}
                onClick={() => setAuthMode("signup")}
                role="tab"
                aria-selected={authMode === "signup"}
              >
                Signup
              </button>
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
                <button className="cc-send cc-auth-cta" type="submit" disabled={authBusy}>
                  {authBusy ? "Creating account..." : "Signup & Send OTP"}
                </button>
              </form>
            ) : (
              <>
                <form className="cc-auth-form" onSubmit={handleRequestOtp}>
                  <div className="cc-auth-channel-toggle">
                    <button
                      type="button"
                      className={otpChannel === "email" ? "active" : ""}
                      onClick={() => setOtpChannel("email")}
                    >
                      Email OTP
                    </button>
                    <button
                      type="button"
                      className={otpChannel === "mobile" ? "active" : ""}
                      onClick={() => setOtpChannel("mobile")}
                    >
                      Mobile OTP
                    </button>
                  </div>
                  {otpChannel === "email" ? (
                    <input
                      className="cc-auth-input"
                      type="email"
                      placeholder="Enter your email"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      required
                    />
                  ) : (
                    <input
                      className="cc-auth-input"
                      placeholder="Enter your mobile number"
                      value={loginMobile}
                      onChange={(event) => setLoginMobile(event.target.value)}
                      required
                    />
                  )}
                  <button className="cc-send cc-auth-cta" type="submit" disabled={authBusy}>
                    {authBusy ? "Sending OTP..." : "Send OTP"}
                  </button>
                </form>

                <form className="cc-auth-form cc-auth-verify" onSubmit={handleVerifyOtp}>
                  <input
                    className="cc-auth-input"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(event) => setOtp(event.target.value)}
                    required
                  />
                  <button className="cc-send cc-auth-cta" type="submit" disabled={authBusy}>
                    {authBusy ? "Verifying..." : "Verify OTP & Start Chat"}
                  </button>
                </form>
              </>
            )}

            {authMessage ? <p className="cc-auth-message">{authMessage}</p> : null}
            {authError ? <p className="cc-auth-error">{authError}</p> : null}
            {debugOtp ? <p className="cc-auth-debug">Dev OTP: {debugOtp}</p> : null}
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
      onRetry={() => {
        if (!student?.id) return;
        setSessionId("");
        setError("");
        setLoading(true);
        createSession(student.id, siteContext)
          .then((session) => {
            setSessionId(session._id || session.id);
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
