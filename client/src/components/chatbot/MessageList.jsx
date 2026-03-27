import { AnimatePresence } from "framer-motion";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function MessageList({
  messages,
  seenMeta,
  listRef,
  aiStageLabel,
  isSending,
  agentTyping,
  onRichAction,
  starterPrompts = [],
  onStarterClick,
  resumeBannerVisible = false,
  historyCount = 0,
  onResume,
  onDismissResume,
}) {
  const latestStudentIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (String(messages[i]?.sender || "") === "student") return i;
    }
    return -1;
  })();

  return (
    <section
      className="cc-message-list"
      ref={listRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Chat conversation"
    >
      {starterPrompts.length ? (
        <div className="cc-suggestions" aria-label="Conversation starters">
          {starterPrompts.map((prompt) => (
            <button key={prompt} type="button" className="cc-chip" onClick={() => onStarterClick?.(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      {resumeBannerVisible ? (
        <div className="cc-resume-banner">
          <p>You have {historyCount} previous sessions.</p>
          <div className="cc-resume-actions">
            <button type="button" className="cc-chip" onClick={onResume}>Resume Context</button>
            <button type="button" className="cc-link-btn" onClick={onDismissResume}>Dismiss</button>
          </div>
        </div>
      ) : null}

      {messages.map((message, index) => (
        <MessageBubble
          key={`${message.createdAt || index}-${message.sender}-${String(message.content || "").slice(0, 32)}`}
          message={message}
          index={index}
          readReceipt={
            index === latestStudentIndex
              ? {
                  seenAt: String(seenMeta?.seenAt || ""),
                }
              : null
          }
          onRichAction={onRichAction}
        />
      ))}

      <AnimatePresence>
        {isSending && (
          <TypingIndicator key="ai-typing" actor="ai" label={aiStageLabel || "Generating response..."} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {agentTyping && (
          <TypingIndicator key="agent-typing" actor="agent" label="Agent is typing..." />
        )}
      </AnimatePresence>
    </section>
  );
}
