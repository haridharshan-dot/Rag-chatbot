import { motion } from "framer-motion";

export default function TypingIndicator({ label = "Generating response...", actor = "ai" }) {
  return (
    <motion.div
      className={`cc-typing cc-typing-${actor}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18 }}
    >
      <div className="cc-typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{label}</p>
    </motion.div>
  );
}
