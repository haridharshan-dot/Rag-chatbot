import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BRANDING } from "../../config/branding";
import RichCards from "./RichCards";
import ChatMarkdown from "./ChatMarkdown";

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

export default function MessageBubble({ message, onRichAction, index = 0 }) {
  const variant = getVariant(message.sender);
  const isStudent = variant === "student";
  const showAvatar = !isStudent;
  const timestamp = formatTime(message.createdAt);
  const senderLabel = variant === "student" ? "You" : variant === "bot" ? "Assistant" : variant;
  const text = String(message.content || "");
  const messageId = useMemo(
    () => `${message.sender || "bot"}-${message.createdAt || ""}-${text.slice(0, 80)}`,
    [message.createdAt, message.sender, text]
  );
  const [visibleText, setVisibleText] = useState(variant === "bot" ? "" : text);

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
          {variant === "agent" ? "A" : <img src={BRANDING.chatbotLogoUrl} alt={BRANDING.chatbotLogoAlt} />}
        </div>
      )}

      <article className={`cc-bubble cc-bubble-${variant}`} aria-label={`${senderLabel} at ${timestamp}`}>
        {variant === "bot" ? (
          <ChatMarkdown content={visibleText} />
        ) : (
          <p className="cc-bubble-text">{visibleText}</p>
        )}
        <small className="cc-bubble-time">{timestamp}</small>
        {variant === "bot" && visibleText.length === text.length ? <RichCards message={text} onAction={onRichAction} /> : null}
      </article>
    </motion.div>
  );
}
