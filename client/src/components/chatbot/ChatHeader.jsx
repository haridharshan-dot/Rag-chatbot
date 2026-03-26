import { motion } from "framer-motion";
import { BRANDING } from "../../config/branding";

const LANG_OPTIONS = [
  { value: "en", label: "EN" },
  { value: "hi", label: "HI" },
];

export default function ChatHeader({
  connectionStatus,
  handoffPending,
  agentConnected,
  onEscalate,
  isAgentAvailable,
  agentButtonLabel,
  agentAvailabilityLabel,
  onClose,
  language,
  onChangeLanguage,
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
          <h3>SONATECH AI ASSISTANT</h3>
          <p>
            <span className={`cc-dot cc-dot-${statusTone}`} />
            {statusLabel}
          </p>
        </div>
      </div>

      <div className="cc-header-actions">
        {!agentConnected && (
          <div className="cc-agent-wrap">
            <button
              className="cc-agent-cta"
              onClick={onEscalate}
              disabled={!isAgentAvailable}
              aria-label="Connect to live agent"
              title="Live agent hours are 9AM to 5PM IST"
            >
              {handoffPending ? "Requested" : agentButtonLabel}
            </button>
            <span className="cc-agent-hours-mini">{agentAvailabilityLabel}</span>
          </div>
        )}
        <select
          className="cc-lang"
          value={language}
          onChange={(event) => onChangeLanguage(event.target.value)}
          aria-label="Chat language"
        >
          {LANG_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="cc-action-btn" onClick={onClose} aria-label="Close chatbot">
          Close
        </button>
      </div>
    </motion.header>
  );
}
