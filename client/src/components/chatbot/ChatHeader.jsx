import { motion } from "framer-motion";
import { BRANDING } from "../../config/branding";

const AGENT_TIME_SLOTS = ["9AM-12PM", "12PM-3PM", "3PM-5PM"];

export default function ChatHeader({
  connectionStatus,
  handoffPending,
  agentConnected,
  onEscalate,
  isAgentAvailable,
  agentButtonLabel,
  agentAvailabilityLabel,
  onClose,
}) {
  const statusTone = connectionStatus === "online" ? "online" : "offline";
  const statusLabel = connectionStatus === "online" ? "Online" : "Reconnecting";

  return (
    <motion.header
      className="cc-header"
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22 }}
    >
      <div className="cc-brand-wrap">
        <img src={BRANDING.chatbotLogoUrl} alt={BRANDING.chatbotLogoAlt} className="cc-avatar" />
        <div className="cc-brand-copy">
          <h3>AI ASSISTANT</h3>
          <p>
            <span className={`cc-dot cc-dot-${statusTone}`} />
            {statusLabel}
          </p>
        </div>
      </div>

      <div className="cc-header-actions">
        <div className="cc-hours-group" aria-label="Live agent working slots">
          {AGENT_TIME_SLOTS.map((slot) => (
            <span key={slot} className="cc-hours-pill">{slot}</span>
          ))}
        </div>
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
              {handoffPending ? "Requested" : `${agentButtonLabel} (${agentAvailabilityLabel})`}
            </button>
          </div>
        )}
        <button className="cc-action-btn" onClick={onClose} aria-label="Close chatbot">
          Close
        </button>
      </div>
    </motion.header>
  );
}
