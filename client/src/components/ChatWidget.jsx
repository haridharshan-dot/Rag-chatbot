import { useEffect, useMemo, useRef, useState } from "react";
import { escalateToAgent, fetchHistory, sendStudentMessage } from "../api";
import { socket } from "../socket";

function formatTime(dateLike) {
  const date = new Date(dateLike);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWidget({ sessionId, studentId, loading }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [handoffPending, setHandoffPending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!sessionId) return;

    async function loadHistory() {
      const data = await fetchHistory(sessionId);
      setMessages(data.messages || []);
      setShowEscalate(data.status === "queued" || data.status === "active");
      setAgentConnected(data.status === "active");
      setHandoffPending(data.status === "queued");
    }

    loadHistory().catch((error) => {
      console.error("Unable to load history", error);
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    socket.connect();
    socket.emit("session:join", { sessionId, role: "student", studentId });

    const onChatMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    const onAgentJoined = () => {
      setAgentConnected(true);
      setShowEscalate(true);
      setHandoffPending(false);
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: "You are now connected to a live agent.",
          createdAt: new Date().toISOString(),
        },
      ]);
    };

    socket.on("chat:message", onChatMessage);
    socket.on("agent:joined", onAgentJoined);

    return () => {
      socket.off("chat:message", onChatMessage);
      socket.off("agent:joined", onAgentJoined);
    };
  }, [sessionId, studentId]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  async function onSend() {
    if (!canSend || !sessionId) return;

    const text = input.trim();
    setInput("");
    setIsSending(true);

    try {
      const response = await sendStudentMessage(sessionId, text);
      if (response.autoEscalated || response.outOfScope || response.escalationSuggested) {
        setShowEscalate(true);
      }
      if (response.autoEscalated || response.outOfScope) {
        setHandoffPending(true);
      }
    } catch (error) {
      console.error("Failed to send message", error);
    } finally {
      setIsSending(false);
    }
  }

  async function onEscalate() {
    if (!sessionId) return;
    await escalateToAgent(sessionId);
    setShowEscalate(true);
    setHandoffPending(true);
    setMessages((prev) => [
      ...prev,
      {
        sender: "system",
        content: "Agent request sent. A support agent will join soon.",
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  return (
    <>
      <button className="chat-fab" onClick={() => setOpen((prev) => !prev)}>
        {open ? "Close" : "Ask AI"}
      </button>

      {open && (
        <aside className="chat-widget">
          <div className="chat-header">
            <h3>College Concierge</h3>
            <span>{loading ? "Starting session..." : `Session: ${sessionId?.slice(-6)}`}</span>
          </div>

          <div className="chat-list" ref={listRef}>
            {messages.map((message, index) => (
              <div key={`${index}-${message.content.slice(0, 8)}`} className={`bubble ${message.sender}`}>
                <p>{message.content}</p>
                <small>{formatTime(message.createdAt || Date.now())}</small>
              </div>
            ))}
          </div>

          {showEscalate && !agentConnected && (
            handoffPending ? (
              <p className="agent-live">Agent request sent. A support agent will join shortly.</p>
            ) : (
              <button className="agent-btn" onClick={onEscalate}>
                Talk to an Agent
              </button>
            )
          )}

          {agentConnected && <p className="agent-live">You are now connected to a live agent.</p>}

          <div className="chat-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about fees, courses, deadlines..."
              onKeyDown={(e) => {
                if (e.key === "Enter") onSend();
              }}
            />
            <button onClick={onSend} disabled={!canSend || loading || !sessionId}>
              Send
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
