import { AnimatePresence } from "framer-motion";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

export default function MessageList({
  messages,
  listRef,
  aiStageLabel,
  isSending,
  agentTyping,
  onRichAction,
}) {
  return (
    <section
      className="cc-message-list"
      ref={listRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Chat conversation"
    >
      {messages.map((message, index) => (
        <MessageBubble
          key={`${index}-${message.sender}-${String(message.content || "").slice(0, 22)}`}
          message={message}
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
