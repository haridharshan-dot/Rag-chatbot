import { AnimatePresence, motion } from "framer-motion";

export default function AgentStatusBanner({ status }) {
  if (!status) return null;

  const tone = status.type || "info";

  return (
    <AnimatePresence>
      <motion.div
        className={`cc-agent-banner cc-agent-banner-${tone}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.18 }}
      >
        {status.label}
      </motion.div>
    </AnimatePresence>
  );
}
