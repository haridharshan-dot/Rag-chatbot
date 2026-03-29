export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  sessionId,
  isResolved,
  onTyping,
}) {
  return (
    <div className="ad-composer">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if (sessionId) onTyping?.();
        }}
        placeholder={
          isResolved
            ? "Session resolved. Messaging is disabled."
            : sessionId
              ? "Reply to student..."
              : "Select a conversation to reply"
        }
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <button type="button" onClick={onSend} disabled={disabled || !value.trim()}>
        Send
      </button>
    </div>
  );
}

