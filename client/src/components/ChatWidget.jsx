import { useEffect, useMemo, useRef, useState } from "react";
import { escalateToAgent, fetchHistory, sendStudentMessage } from "../api";
import { socket } from "../socket";
import { BRANDING } from "../config/branding";

function formatTime(dateLike) {
  const date = new Date(dateLike);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWidget({ sessionId, studentId, loading, defaultOpen = false, hideFab = false }) {
  const [open, setOpen] = useState(defaultOpen);
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

  useEffect(() => {
    // Notify parent embed script for compact/floating iframe sizing.
    window.parent?.postMessage(
      {
        type: "sona-chatbot:state",
        open,
        dimensions: open
          ? { width: 420, height: 700 }
          : { width: 86, height: 56 },
      },
      "*"
    );
  }, [open]);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  async function onSend() {
    if (!canSend || !sessionId) return;

    const text = input.trim();
    setInput("");
    setIsSending(true);

    try {
      const response = await sendStudentMessage(sessionId, text);
      const sessionStatus = String(response.sessionStatus || "bot");
      const shouldOfferEscalation =
        response.autoEscalated ||
        response.outOfScope ||
        sessionStatus === "queued" ||
        sessionStatus === "active";

      setShowEscalate(Boolean(shouldOfferEscalation));
      setAgentConnected(sessionStatus === "active");
      setHandoffPending(
        sessionStatus === "queued" ||
          response.autoEscalated ||
          false
      );
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
      {!hideFab && !open && (
        <button
          className="chat-fab chat-fab-logo"
          onClick={() => setOpen(true)}
          aria-label="Open Sona chatbot"
        >
          <img
            src={BRANDING.chatbotLogoUrl}
            alt={BRANDING.chatbotLogoAlt}
            className="chat-fab-logo-image"
          />
        </button>
      )}

      {open && (
        <aside className="chat-widget">
          <div className="chat-header">
            <div className="chat-brand">
              <img src={BRANDING.chatbotLogoUrl} alt={BRANDING.chatbotLogoAlt} className="ai-avatar" />
              <div>
                <h3>Ask AI - Sona Concierge</h3>
                <span>{loading ? "Starting session..." : `Session: ${sessionId?.slice(-6)}`}</span>
              </div>
            </div>
            <button className="chat-close-btn" onClick={() => setOpen(false)} aria-label="Close chatbot">
              Close
            </button>
          </div>

          <div className="chat-list" ref={listRef}>
            {messages.map((message, index) => (
              <div key={`${index}-${message.content.slice(0, 8)}`} className={`bubble-row ${message.sender}`}>
                {(message.sender === "bot" || message.sender === "system") && (
                  <img src={BRANDING.chatbotLogoUrl} alt={BRANDING.chatbotLogoAlt} className="avatar-mini" />
                )}
                <div className={`bubble ${message.sender}`}>
                  <p>{message.content}</p>
                  <small>{formatTime(message.createdAt || Date.now())}</small>
                </div>
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
