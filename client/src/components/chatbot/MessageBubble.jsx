import { motion } from "framer-motion";
import { BRANDING } from "../../config/branding";
import RichCards from "./RichCards";

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

export default function MessageBubble({ message, onRichAction }) {
  const variant = getVariant(message.sender);
  const isStudent = variant === "student";
  const showAvatar = !isStudent;

  return (
    <motion.div
      className={`cc-row cc-row-${variant}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      {showAvatar && (
        <div className={`cc-mini-avatar cc-mini-${variant}`}>
          {variant === "agent" ? "A" : <img src={BRANDING.chatbotLogoUrl} alt={BRANDING.chatbotLogoAlt} />}
        </div>
      )}

      <article className={`cc-bubble cc-bubble-${variant}`}>
        <p className="cc-bubble-text">{message.content}</p>
        <small className="cc-bubble-time">{formatTime(message.createdAt)}</small>
        {variant === "bot" && <RichCards message={message.content} onAction={onRichAction} />}
      </article>
    </motion.div>
  );
}
