import { motion } from "framer-motion";

function BotIcon() {
  return (
    <svg className="cc-avatar-bot-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="4" fill="currentColor" opacity="0.14" />
      <rect x="6" y="9" width="12" height="9" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="13" r="1.1" fill="currentColor" />
      <circle cx="14" cy="13" r="1.1" fill="currentColor" />
      <path d="M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 6V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function ChatHeader({
  connectionStatus,
  handoffPending,
  agentConnected,
  showChannelTabs = false,
  aiTabLabel = "AI Paused",
  agentTabLabel = "Agent Live",
  activeChannel,
  onChannelChange,
  onEscalate,
  isAgentAvailable,
  agentButtonLabel,
  agentAvailabilityLabel,
  studentDisplayName,
  historyCount,
  onClearChat,
  clearBusy = false,
  onStudentLogout,
  onShowAlerts,
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
          <span className="cc-avatar cc-avatar-bot" aria-hidden="true">
            <BotIcon />
          </span>
          <div className="cc-brand-copy">
            <h3>AI ASSISTANT SONA COLLEGE</h3>
            <p>Admissions, cutoffs, scholarships, courses</p>
          </div>
        </div>

        <div className="cc-header-actions">
          {onClearChat ? (
            <button
              className="cc-action-btn"
              onClick={onClearChat}
              aria-label="Clear current chat"
              disabled={clearBusy}
            >
              {clearBusy ? "Clearing..." : "Clear"}
            </button>
          ) : null}
          {onShowAlerts ? (
            <button
              className="cc-action-btn"
              onClick={onShowAlerts}
              aria-label="Show admission alerts"
            >
              Alerts
            </button>
          ) : null}
{onStudentLogout ? (
            <button className="cc-action-btn cc-action-muted" onClick={onStudentLogout} aria-label="Logout / Switch account" title="Logout and switch account">
              Logout
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
        {showChannelTabs ? (
          <div className="cc-channel-tabs" role="tablist" aria-label="Conversation channel">
            <button
              type="button"
              role="tab"
              aria-selected={activeChannel === "ai"}
              className={`cc-channel-tab cc-channel-tab-ai ${activeChannel === "ai" ? "active" : ""}`}
              onClick={() => onChannelChange?.("ai")}
              title="AI responses are paused while live agent is connected"
            >
              {aiTabLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeChannel === "agent"}
              className={`cc-channel-tab cc-channel-tab-agent ${activeChannel === "agent" ? "active" : ""}`}
              onClick={() => onChannelChange?.("agent")}
              title="Live agent conversation"
            >
              {agentTabLabel}
            </button>
          </div>
        ) : null}
        {studentDisplayName ? (
          <div className="cc-student-pill" title={`Recent sessions: ${historyCount || 0}`}>
            <span>{studentDisplayName}</span>
            <small>{sessionLabel}</small>
          </div>
        ) : null}
        {!agentConnected && (
          <div className="cc-agent-wrap">
            <div className="cc-agent-stack">
              <button
                className="cc-agent-cta"
                onClick={onEscalate}
                disabled={!isAgentAvailable || handoffPending}
                aria-label="Connect to live agent"
                title={`Live agents available ${agentAvailabilityLabel}`}
                aria-busy={handoffPending}
              >
                {handoffPending ? "Requested" : agentButtonLabel}
              </button>
              <small className="cc-agent-note">Agents available {agentAvailabilityLabel}</small>
            </div>
          </div>
        )}
      </div>
    </motion.header>
  );
}
