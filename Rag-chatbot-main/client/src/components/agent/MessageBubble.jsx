function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initialsFromSender(sender) {
  const value = String(sender || "u");
  if (value === "student") return "ST";
  if (value === "agent") return "AG";
  if (value === "bot") return "AI";
  return "SY";
}

export default function MessageBubble({ message, showTimestamps = true }) {
  const sender = String(message?.sender || "system");
  const content = String(message?.content || "");
  const time = formatTime(message?.createdAt);
  const sideClass = sender === "agent" ? "agent" : "other";
  const toneClass =
    sender === "student"
      ? "student"
      : sender === "agent"
        ? "agent"
        : sender === "bot"
          ? "bot"
          : "system";

  return (
    <div className={`ad-msg-row ${sideClass}`}>
      {sideClass === "other" ? <span className={`ad-msg-avatar ${toneClass}`}>{initialsFromSender(sender)}</span> : null}
      <article className={`ad-msg-bubble ${toneClass}`}>
        <p>{content}</p>
        {showTimestamps ? <small>{time}</small> : null}
      </article>
      {sideClass === "agent" ? <span className={`ad-msg-avatar ${toneClass}`}>AG</span> : null}
    </div>
  );
}

