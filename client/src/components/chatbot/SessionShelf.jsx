function formatSessionDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function buildSessionPreview(session) {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  const candidate = [...messages]
    .reverse()
    .find((message) => {
      const sender = String(message?.sender || "");
      const content = String(message?.content || "").trim();
      return content && sender !== "system";
    });

  if (!candidate) return "New conversation";

  const text = String(candidate.content || "").replace(/\s+/g, " ").trim();
  return text.length > 56 ? `${text.slice(0, 56)}...` : text;
}

export default function SessionShelf({
  sessions = [],
  activeSessionId = "",
  onSelectSession,
  onNewChat,
  loading = false,
}) {
  if (!sessions.length && !onNewChat) return null;

  return (
    <div className="cc-session-shelf" aria-label="Recent chats">
      <div className="cc-session-shelf-head">
        <div>
          <p className="cc-session-eyebrow">Chat history</p>
          <h4>Recent conversations</h4>
        </div>
        {onNewChat ? (
          <button type="button" className="cc-session-new" onClick={onNewChat} disabled={loading}>
            {loading ? "Starting..." : "New chat"}
          </button>
        ) : null}
      </div>

      <div className="cc-session-list">
        {sessions.map((session) => {
          const id = String(session?._id || session?.id || "");
          const active = id === String(activeSessionId || "");
          return (
            <button
              key={id}
              type="button"
              className={`cc-session-card ${active ? "active" : ""}`}
              onClick={() => onSelectSession?.(id)}
              aria-pressed={active}
            >
              <span className="cc-session-date">{formatSessionDate(session?.updatedAt || session?.createdAt)}</span>
              <strong>{active ? "Current chat" : "Recent chat"}</strong>
              <span className="cc-session-preview">{buildSessionPreview(session)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
