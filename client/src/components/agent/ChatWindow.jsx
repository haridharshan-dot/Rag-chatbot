import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";

function getWaitMinutes(escalationRequestedAt) {
  if (!escalationRequestedAt) return 0;
  const deltaMs = Date.now() - new Date(escalationRequestedAt).getTime();
  return Math.max(0, Math.round(deltaMs / 60000));
}

function getStudentLabel(session) {
  return session?.studentName || session?.studentEmail || session?.studentId || "student";
}

export default function ChatWindow({
  activeQueueSession,
  activeSessionId,
  resolvedDisplayName,
  authEmail,
  messages,
  showTimestamps,
  studentTyping,
  draft,
  onDraftChange,
  onSend,
  onTyping,
  onResolve,
  listRef,
  isMobile,
  onBackToQueue,
}) {
  const statusLabel = activeQueueSession?.status || "bot";
  const waitMinutes = getWaitMinutes(activeQueueSession?.escalationRequestedAt);

  return (
    <section className="ad-chat">
      <header className="ad-chat-head">
        <div className="ad-chat-head-main">
          {isMobile ? (
            <button type="button" className="ad-back-btn" onClick={onBackToQueue}>Queue</button>
          ) : null}
          <div>
            <h3>{activeSessionId ? getStudentLabel(activeQueueSession) : "Select a conversation"}</h3>
            <p>
              {activeQueueSession
                ? `Assigned to ${resolvedDisplayName} • ${statusLabel} • ${waitMinutes}m wait`
                : "Choose a user from the queue to start chatting."}
            </p>
            {studentTyping ? <p className="ad-typing">Student is typing...</p> : null}
          </div>
        </div>
        <div className="ad-chat-head-actions">
          <span className="ad-agent-email">{authEmail}</span>
          <button type="button" onClick={onResolve} disabled={!activeSessionId}>Mark Resolved</button>
        </div>
      </header>

      <div className="ad-chat-log" ref={listRef}>
        {messages.map((message, index) => (
          <MessageBubble
            key={`${index}-${message.sender}-${String(message.content || "").slice(0, 18)}`}
            message={message}
            showTimestamps={showTimestamps}
          />
        ))}
      </div>

      <ChatInput
        value={draft}
        onChange={onDraftChange}
        onSend={onSend}
        disabled={!activeSessionId}
        sessionId={activeSessionId}
        onTyping={onTyping}
      />
    </section>
  );
}
