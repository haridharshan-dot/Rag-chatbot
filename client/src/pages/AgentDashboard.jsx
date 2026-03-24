import { useEffect, useState } from "react";
import StatusDashboard from "../components/StatusDashboard";
import {
  agentLogin,
  agentMicrosoftLogin,
  fetchAgentQueue,
  fetchHistory,
  getAgentToken,
  joinAgentSession,
  resolveSession,
  setAgentToken,
  sendAgentMessage,
} from "../api";
import { signInWithMicrosoft } from "../auth/microsoftAuth";
import { socket } from "../socket";

function normalizeSessionId(session) {
  return session?._id || session?.id;
}

function formatDate(dateLike) {
  if (!dateLike) return "-";
  return new Date(dateLike).toLocaleString();
}

function getWaitMinutes(escalationRequestedAt) {
  if (!escalationRequestedAt) return 0;
  const deltaMs = Date.now() - new Date(escalationRequestedAt).getTime();
  return Math.max(0, Math.round(deltaMs / 60000));
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
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [microsoftLoading, setMicrosoftLoading] = useState(false);

  useEffect(() => {
    if (!authToken) return;

    socket.connect();
    socket.emit("agent:register", { token: authToken });

    const refreshQueue = async () => {
      setQueueLoading(true);
      setQueueError("");
      try {
        const sessions = await fetchAgentQueue();
        setQueue(sessions);
        setLastSyncAt(new Date().toISOString());
      } catch (error) {
        console.error("Queue fetch failed", error);
        setQueueError("Unable to refresh queue right now.");
      } finally {
        setQueueLoading(false);
      }
    };

    const onMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    socket.on("queue:updated", refreshQueue);
    socket.on("chat:message", onMessage);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    const pollId = setInterval(refreshQueue, 20000);

    refreshQueue();
    setSocketConnected(socket.connected);

    return () => {
      socket.off("queue:updated", refreshQueue);
      socket.off("chat:message", onMessage);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      clearInterval(pollId);
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

  async function onMicrosoftLogin() {
    setAuthError("");
    setMicrosoftLoading(true);
    try {
      const microsoft = await signInWithMicrosoft();
      const data = await agentMicrosoftLogin(microsoft.accessToken);
      setAgentToken(data.token);
      setAuthToken(data.token);
      setAgentId(data.agentId || microsoft.username || "agent");
    } catch (error) {
      setAuthError(
        error?.response?.data?.message || error?.message || "Microsoft sign-in failed."
      );
    } finally {
      setMicrosoftLoading(false);
    }
  }

  function onLogout() {
    setAgentToken("");
    setAuthToken("");
    setQueue([]);
    setActiveSessionId("");
    setMessages([]);
    setQueueError("");
    setLastSyncAt("");
    setSocketConnected(false);
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

  const activeQueueSession = queue.find((session) => normalizeSessionId(session) === activeSessionId);
  const avgWait = queue.length
    ? Math.round(
        queue.reduce((sum, session) => sum + getWaitMinutes(session.escalationRequestedAt), 0) /
          queue.length
      )
    : 0;

  if (!authToken) {
    return (
      <div className="agent-auth-wrap">
        <section className="agent-auth-card">
          <div className="agent-auth-brand">
            <img src="/sonalogo.png" alt="Sona logo" className="agent-auth-logo" />
            <div>
              <p className="eyebrow">Sona Support Desk</p>
              <h2>Agent Console Login</h2>
            </div>
          </div>
          <p>Sign in with staff credentials to handle live student conversations.</p>
          <button
            type="button"
            className="ms-login-btn"
            onClick={onMicrosoftLogin}
            disabled={microsoftLoading}
          >
            {microsoftLoading ? "Signing in..." : "Continue with Microsoft"}
          </button>
          <p className="agent-auth-divider">or use agent credentials</p>
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
    <div className="agent-layout modern-agent-layout">
      <aside className="queue-panel modern-queue-panel">
        <div className="queue-head modern-queue-head">
          <div>
            <p className="eyebrow">Live Operations</p>
            <h3>Support Command Center</h3>
          </div>
          <button className="ghost-btn" onClick={onLogout}>
            Logout
          </button>
        </div>

        <div className="ops-kpis">
          <div className="kpi-card">
            <span>Queue</span>
            <strong>{queue.length}</strong>
          </div>
          <div className="kpi-card">
            <span>Avg Wait</span>
            <strong>{avgWait}m</strong>
          </div>
          <div className="kpi-card">
            <span>Socket</span>
            <strong className={socketConnected ? "state-up" : "state-down"}>
              {socketConnected ? "LIVE" : "OFF"}
            </strong>
          </div>
        </div>

        <p className="queue-sync">Last sync: {formatDate(lastSyncAt)}</p>
        {queueError ? <p className="agent-error">{queueError}</p> : null}
        {queueLoading && <p className="queue-loading">Refreshing queue...</p>}
        {queue.length === 0 && !queueLoading && <p>No students waiting right now.</p>}
        {queue.map((session) => {
          const sessionId = normalizeSessionId(session);
          const wait = getWaitMinutes(session.escalationRequestedAt);
          return (
            <button
              key={sessionId}
              className={`queue-item ${activeSessionId === sessionId ? "active" : ""}`}
              onClick={() => openSession(sessionId)}
            >
              <strong>{session.studentId}</strong>
              <span>Requested: {formatDate(session.escalationRequestedAt)}</span>
              <small>Waiting: {wait} min</small>
            </button>
          );
        })}
      </aside>

      <section className="agent-chat-panel modern-agent-chat-panel">
        <div className="agent-chat-header">
          <div>
            <h3>{activeSessionId ? `Session ${activeSessionId.slice(-6)}` : "Select a student"}</h3>
            <p className="session-meta">
              {activeQueueSession
                ? `Student ${activeQueueSession.studentId} • queued ${getWaitMinutes(
                    activeQueueSession.escalationRequestedAt
                  )} min ago`
                : "Pick a queued request to start live support."}
            </p>
          </div>
          <button onClick={markResolved} disabled={!activeSessionId}>
            Mark Resolved
          </button>
        </div>

        <div className="agent-chat-log">
          {messages.map((message, index) => (
            <div key={`${index}-${message.content.slice(0, 8)}`} className={`bubble ${message.sender}`}>
              <p>{message.content}</p>
              <small>{formatDate(message.createdAt)}</small>
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
      <section className="status-panel">
        <StatusDashboard />
      </section>
    </div>
  );
}
