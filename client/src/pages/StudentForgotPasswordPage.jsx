import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  requestStudentForgotPasswordOtp,
  verifyStudentForgotPasswordOtp,
} from "../api";

export default function StudentForgotPasswordPage() {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [debugOtp, setDebugOtp] = useState("");

  async function onRequestOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setDebugOtp("");
    try {
      const data = await requestStudentForgotPasswordOtp({
        mobile: String(mobile || "").trim(),
      });
      setOtpRequested(true);
      setSuccess("Reset OTP sent to your registered mobile.");
      if (data?.otp) {
        setDebugOtp(data.otp);
      }
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Could not send reset OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await verifyStudentForgotPasswordOtp({
        mobile: String(mobile || "").trim(),
        otp: String(otp || "").trim(),
        newPassword: String(newPassword || "").trim(),
      });
      setSuccess("Password updated successfully. Redirecting to login...");
      setOtp("");
      setNewPassword("");
      setTimeout(() => navigate("/", { replace: true }), 900);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="student-page">
      <section className="hero-card">
        <p className="eyebrow">Student Portal</p>
        <h2>Reset Password with OTP</h2>
        <p>
          Enter your registered mobile number to receive a reset OTP. After OTP verification,
          set a new password and sign in again.
        </p>
      </section>

      <section className="student-auth-shell">
        <aside className="student-auth-intro">
          <p className="eyebrow">Recovery</p>
          <h3>Forgot your password?</h3>
          <p>
            This flow verifies your registered mobile with OTP before allowing password update.
          </p>
          <ul className="student-auth-points">
            <li>Mobile OTP verification</li>
            <li>Secure password reset</li>
            <li>Return to login after update</li>
          </ul>
        </aside>

        <div className="student-auth-card">
          <h3 className="student-reset-title">Forgot password? Reset with OTP</h3>
          <form className="student-auth-form" onSubmit={onRequestOtp}>
            <input
              placeholder="Enter registered mobile"
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Sending OTP..." : "Send Reset OTP"}
            </button>
          </form>

          {otpRequested ? (
            <form className="student-auth-form student-forgot-form" onSubmit={onVerifyOtp}>
              <input
                placeholder="Enter OTP"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                inputMode="numeric"
                maxLength={6}
                required
              />
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={6}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? "Updating..." : "Verify OTP & Update Password"}
              </button>
            </form>
          ) : null}

          {error ? <p className="agent-error">{error}</p> : null}
          {success ? <p className="admin-feedback">{success}</p> : null}
          {debugOtp ? <p className="student-dev-otp">Dev OTP: {debugOtp}</p> : null}
          <div className="student-reset-links">
            <Link to="/" className="student-link-btn">Back to login</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
