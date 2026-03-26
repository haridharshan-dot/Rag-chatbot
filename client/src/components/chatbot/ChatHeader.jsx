import { motion } from "framer-motion";
import { BRANDING } from "../../config/branding";

const AGENT_TIME_SLOT = "9AM-5PM";

export default function ChatHeader({
  connectionStatus,
  handoffPending,
  agentConnected,
  onEscalate,
  isAgentAvailable,
  agentButtonLabel,
  agentAvailabilityLabel,
  studentDisplayName,
  historyCount,
  onStudentLogout,
  onClose,
}) {
  const statusTone = connectionStatus === "online" ? "online" : "offline";
  const statusLabel = connectionStatus === "online" ? "Online" : "Reconnecting";
  const sessionLabel = historyCount === 1 ? "1 chat" : `${historyCount || 0} chats`;

  return (
    <motion.header
      className="cc-header"
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22 }}
    >
      <div className="cc-header-main">
        <div className="cc-brand-wrap">
          <img src={BRANDING.chatbotLogoUrl} alt={BRANDING.chatbotLogoAlt} className="cc-avatar" />
          <div className="cc-brand-copy">
            <h3>SONA AI CONCIERGE</h3>
            <p>Admissions, fees, cutoffs, scholarships</p>
          </div>
        </div>

        <div className="cc-header-actions">
          {onStudentLogout ? (
            <button className="cc-action-btn cc-action-muted" onClick={onStudentLogout} aria-label="Switch account">
              Switch
            </button>
          ) : null}
          <button className="cc-action-btn cc-action-close" onClick={onClose} aria-label="Close chatbot">
            X
          </button>
        </div>
      </div>

      <div className="cc-header-meta">
        <div className="cc-header-presence">
          <span className={`cc-dot cc-dot-${statusTone}`} />
          <span>{statusLabel}</span>
        </div>
        <div className="cc-hours-group" aria-label="Live agent working slots">
          <span className="cc-hours-pill">{AGENT_TIME_SLOT}</span>
        </div>
        {studentDisplayName ? (
          <div className="cc-student-pill" title={`Recent sessions: ${historyCount || 0}`}>
            <span>{studentDisplayName}</span>
            <small>{sessionLabel}</small>
          </div>
        ) : null}
        {!agentConnected && (
          <div className="cc-agent-wrap">
            <button
              className="cc-agent-cta"
              onClick={onEscalate}
              disabled={!isAgentAvailable || handoffPending}
              aria-label="Connect to live agent"
              title="Live agent hours are 9AM to 5PM IST"
              aria-busy={handoffPending}
            >
              {handoffPending ? "Requested" : `${agentButtonLabel} ${agentAvailabilityLabel}`}
            </button>
          </div>
        )}
      </div>
    </motion.header>
  );
}
