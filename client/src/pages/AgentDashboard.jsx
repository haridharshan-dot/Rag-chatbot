import { useEffect, useState } from "react";
import {
  agentLogin,
  fetchAgentQueue,
  fetchHistory,
  getAgentToken,
  joinAgentSession,
  resolveSession,
  setAgentToken,
  sendAgentMessage,
} from "../api";
import { socket } from "../socket";

function normalizeSessionId(session) {
  return session?._id || session?.id;
}

export default function AgentDashboard() {
  const [authToken, setAuthToken] = useState(() => getAgentToken());
  const [agentId, setAgentId] = useState("agent");
  const [username, setUsername] = useState("agent");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [queue, setQueue] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!authToken) return;

    socket.connect();
    socket.emit("agent:register", { token: authToken });

    const refreshQueue = () => {
      fetchAgentQueue()
        .then((sessions) => setQueue(sessions))
        .catch((error) => console.error("Queue fetch failed", error));
    };

    const onMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    socket.on("queue:updated", refreshQueue);
    socket.on("chat:message", onMessage);

    refreshQueue();

    return () => {
      socket.off("queue:updated", refreshQueue);
      socket.off("chat:message", onMessage);
    };
  }, [agentId, authToken]);

  async function onLogin(event) {
    event.preventDefault();
    setAuthError("");

    try {
      const data = await agentLogin(username, password);
      setAgentToken(data.token);
      setAuthToken(data.token);
      setAgentId(data.agentId || username);
      setPassword("");
    } catch (error) {
      setAuthError(
        error?.response?.data?.message || "Unable to login. Check agent credentials."
      );
    }
  }

  function onLogout() {
    setAgentToken("");
    setAuthToken("");
    setQueue([]);
    setActiveSessionId("");
    setMessages([]);
    socket.disconnect();
  }

  async function openSession(sessionId) {
    await joinAgentSession(sessionId, agentId);
    socket.emit("session:join", { sessionId, role: "agent", token: authToken });
    setActiveSessionId(sessionId);

    const session = await fetchHistory(sessionId);
    setMessages(session.messages || []);

    const updatedQueue = await fetchAgentQueue();
    setQueue(updatedQueue);
  }

  async function sendMessage() {
    if (!activeSessionId || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    await sendAgentMessage(activeSessionId, content, agentId);
  }

  async function markResolved() {
    if (!activeSessionId) return;
    await resolveSession(activeSessionId, agentId);
    setActiveSessionId("");
    setMessages([]);
    const updatedQueue = await fetchAgentQueue();
    setQueue(updatedQueue);
  }

  if (!authToken) {
    return (
      <div className="agent-auth-wrap">
        <section className="agent-auth-card">
          <h2>Agent Console Login</h2>
          <p>Sign in with staff credentials to handle live student conversations.</p>
          <form onSubmit={onLogin} className="agent-auth-form">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Agent username"
              autoComplete="username"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            />
            {authError ? <p className="agent-error">{authError}</p> : null}
            <button type="submit">Sign in</button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="agent-layout">
      <aside className="queue-panel">
        <div className="queue-head">
          <div>
            <p className="eyebrow">Live Operations</p>
            <h3>Agent Queue</h3>
          </div>
          <button className="ghost-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
        {queue.length === 0 && <p>No students waiting right now.</p>}
        {queue.map((session) => {
          const sessionId = normalizeSessionId(session);
          return (
            <button key={sessionId} className="queue-item" onClick={() => openSession(sessionId)}>
              <strong>{session.studentId}</strong>
              <span>Requested: {new Date(session.escalationRequestedAt).toLocaleString()}</span>
            </button>
          );
        })}
      </aside>

      <section className="agent-chat-panel">
        <div className="agent-chat-header">
          <h3>{activeSessionId ? `Session ${activeSessionId.slice(-6)}` : "Select a student"}</h3>
          <button onClick={markResolved} disabled={!activeSessionId}>
            Mark Resolved
          </button>
        </div>

        <div className="agent-chat-log">
          {messages.map((message, index) => (
            <div key={`${index}-${message.content.slice(0, 8)}`} className={`bubble ${message.sender}`}>
              {message.content}
            </div>
          ))}
        </div>

        <div className="agent-composer">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type reply to student"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />
          <button onClick={sendMessage} disabled={!activeSessionId || !draft.trim()}>
            Send
          </button>
        </div>
      </section>
    </div>
  );
}
