import { motion } from "framer-motion";
import { BRANDING } from "../../config/branding";

const LANG_OPTIONS = [
  { value: "en", label: "EN" },
  { value: "hi", label: "HI" },
];

export default function ChatHeader({
  connectionStatus,
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
