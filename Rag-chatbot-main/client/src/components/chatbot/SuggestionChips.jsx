import { motion } from "framer-motion";

export default function SuggestionChips({ suggestions, onPick }) {
  if (!suggestions?.length) return null;

  return (
    <motion.div
      className="cc-suggestions"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {suggestions.map((suggestion) => (
        <button key={suggestion} type="button" className="cc-chip" onClick={() => onPick(suggestion)}>
          {suggestion}
        </button>
      ))}
    </motion.div>
  );
}
