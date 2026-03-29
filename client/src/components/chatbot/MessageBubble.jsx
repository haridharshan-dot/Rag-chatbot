import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import RichCards from "./RichCards";
import ChatMarkdown from "./ChatMarkdown";
import SuggestionChips from "./SuggestionChips";
import StructuredCards from "./StructuredCards";

function BotIcon() {
  return (
    <svg className="cc-mini-bot-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="4" fill="currentColor" opacity="0.14" />
      <rect x="6" y="9" width="12" height="9" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="13" r="1.1" fill="currentColor" />
      <circle cx="14" cy="13" r="1.1" fill="currentColor" />
      <path d="M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 6V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function formatTime(dateLike) {
  const date = new Date(dateLike || Date.now());
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getVariant(sender) {
  if (sender === "student") return "student";
  if (sender === "agent") return "agent";
  if (sender === "system") return "system";
  return "bot";
}

export default function MessageBubble({ message, onRichAction, index = 0, readReceipt = null }) {
  const variant = getVariant(message.sender);
  const isStudent = variant === "student";
  const showAvatar = !isStudent;
  const timestamp = formatTime(message.createdAt);
  const senderLabel = variant === "student" ? "You" : variant === "bot" ? "Assistant" : variant;
  const text = String(message.content || "");
  const isResolvedNotice =
    variant === "system" &&
    /(resolved|session ended|live agent session ended)/i.test(text);
  const messageId = useMemo(
    () => `${message.sender || "bot"}-${message.createdAt || ""}-${text.slice(0, 80)}`,
    [message.createdAt, message.sender, text]
  );
  const [visibleText, setVisibleText] = useState(variant === "bot" ? "" : text);
  const seenAt = String(readReceipt?.seenAt || "");
  const seenDate = seenAt ? new Date(seenAt) : null;
  const messageDate = new Date(message.createdAt || Date.now());
  const showSeen =
    isStudent &&
    seenDate &&
    !Number.isNaN(seenDate.getTime()) &&
    !Number.isNaN(messageDate.getTime()) &&
    seenDate.getTime() >= messageDate.getTime();
  const seenLabel = showSeen ? "Seen" : "";
  const suggestions = Array.isArray(message?.meta?.suggestions) ? message.meta.suggestions : [];
  const structuredCards = Array.isArray(message?.meta?.cards) ? message.meta.cards : [];

  useEffect(() => {
    if (variant !== "bot") {
      setVisibleText(text);
      return;
    }
    if (!text) {
      setVisibleText("");
      return;
    }
    let cursor = 0;
    const step = Math.max(1, Math.ceil(text.length / 70));
    setVisibleText("");
    const timer = setInterval(() => {
      cursor = Math.min(text.length, cursor + step);
      setVisibleText(text.slice(0, cursor));
      if (cursor >= text.length) {
        clearInterval(timer);
      }
    }, 14);
    return () => clearInterval(timer);
  }, [messageId, text, variant]);

  return (
    <motion.div
      className={`cc-row cc-row-${variant}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.016, 0.12) }}
    >
      {showAvatar && (
        <div className={`cc-mini-avatar cc-mini-${variant}`} aria-hidden="true">
          {variant === "agent" ? "A" : <BotIcon />}
        </div>
      )}

      <article className={`cc-bubble cc-bubble-${variant}`} aria-label={`${senderLabel} at ${timestamp}`}>
        {variant === "bot" ? (
          <ChatMarkdown content={visibleText} />
        ) : isResolvedNotice ? (
          <div className="cc-resolved-card" role="status" aria-live="polite">
            <strong className="cc-resolved-title">Agent Session Ended</strong>
            <p className="cc-resolved-text">{visibleText}</p>
          </div>
        ) : (
          <p className="cc-bubble-text">{visibleText}</p>
        )}
        <small className="cc-bubble-time">{timestamp}</small>
        {showSeen ? <small className="cc-read-receipt">{seenLabel}</small> : null}
        {variant === "bot" ? <StructuredCards cards={structuredCards} /> : null}
        {variant === "bot" ? <SuggestionChips suggestions={suggestions} onPick={onRichAction} /> : null}
        {variant === "bot" && visibleText.length === text.length ? <RichCards message={text} onAction={onRichAction} /> : null}
      </article>
    </motion.div>
  );
}
