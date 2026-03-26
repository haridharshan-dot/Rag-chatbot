import { useEffect, useMemo, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import ChatWidget from "./ChatWidget";
import {
  createSession,
  fetchStudentHistory,
  requestStudentForgotPasswordOtp,
  requestStudentOtp,
  studentGoogleLogin,
  studentLogin,
  studentSignup,
  verifyStudentForgotPasswordOtp,
  verifyStudentOtp,
} from "../api";
import { clearStudentToken, getStudentFromToken, setStudentToken } from "../utils/auth";

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
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(Boolean(initialStudent?.id));
  const [error, setError] = useState("");

  const [authMode, setAuthMode] = useState("login");
  const [loginMethod, setLoginMethod] = useState("password");
  const [otpChannel, setOtpChannel] = useState("mobile");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupMobile, setSignupMobile] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMobile, setLoginMobile] = useState("");
  const [forgotMobile, setForgotMobile] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotOtpRequested, setForgotOtpRequested] = useState(false);
  const [otp, setOtp] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [debugOtp, setDebugOtp] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const googleEnabled = Boolean(String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim());

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

  useEffect(() => {
    if (!requiresPopupAuth || !student?.id) {
      setHistoryCount(0);
      return;
    }

    let mounted = true;
    fetchStudentHistory()
      .then((sessions) => {
        if (!mounted) return;
        setHistoryCount(Array.isArray(sessions) ? sessions.length : 0);
      })
      .catch(() => {
        if (!mounted) return;
        setHistoryCount(0);
      });

    return () => {
      mounted = false;
    };
  }, [requiresPopupAuth, student?.id]);

  function handleSwitchAccount() {
    clearStudentToken();
    setStudent(null);
    setHistoryCount(0);
    setSessionId("");
    setError("");
    setAuthError("");
    setAuthMessage("Signed out. Login to continue.");
    setDebugOtp("");
    setOtp("");
    setForgotOtp("");
    setForgotOtpRequested(false);
    setAuthMode("login");
    setLoginMethod("password");
  }

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
        password: signupPassword,
      });
      setAuthMode("login");
      setLoginMethod("otp");
      setOtpChannel("mobile");
      setLoginEmail(signupEmail.trim().toLowerCase());
      setLoginMobile(signupMobile.trim());
      setAuthMessage("Signup successful. OTP sent to your mobile. You can also login with password.");
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
    setDebugOtp("");
    try {
      const data = await requestStudentForgotPasswordOtp({ mobile: forgotMobile });
      setForgotOtpRequested(true);
      setAuthMessage("OTP sent to your mobile for password reset.");
      if (data?.otp) {
        setDebugOtp(data.otp);
      }
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
      setLoginMethod("password");
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
      setAuthMessage("Google login successful. Starting your chat session...");
    } catch (googleError) {
      const message = googleError?.response?.data?.message || "Google login failed";
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
                <p>Sign up, login with password, or use OTP to continue your chat.</p>
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
                  {authBusy ? "Creating account..." : "Signup (Mobile OTP + Password)"}
                </button>
              </form>
            ) : (
              <>
                <div className="cc-auth-channel-toggle">
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

                {googleEnabled ? (
                  <div className="cc-google-wrap">
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => setAuthError("Google login failed")}
                      width="100%"
                      text="continue_with"
                      shape="pill"
                    />
                  </div>
                ) : null}

                {loginMethod === "password" ? (
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
                          setForgotOtpRequested(false);
                          setForgotOtp("");
                          setForgotNewPassword("");
                          setAuthError("");
                          setAuthMessage("");
                        }}
                      >
                        Forgot password? Reset with OTP
                      </button>
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
                  </>
                ) : (
                  <>
                    <form className="cc-auth-form" onSubmit={handleRequestOtp}>
                      <div className="cc-auth-channel-toggle">
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
                          className="cc-auth-input"
                          placeholder="Enter your mobile number"
                          value={loginMobile}
                          onChange={(event) => setLoginMobile(event.target.value)}
                          required
                        />
                      ) : (
                        <input
                          className="cc-auth-input"
                          type="email"
                          placeholder="Enter your email"
                          value={loginEmail}
                          onChange={(event) => setLoginEmail(event.target.value)}
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
      chatContainerProps={{
        studentDisplayName: requiresPopupAuth ? student?.name || "Student" : "",
        historyCount: requiresPopupAuth ? historyCount : 0,
        onStudentLogout: requiresPopupAuth && student?.id ? handleSwitchAccount : null,
      }}
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
