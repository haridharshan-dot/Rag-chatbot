import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1] || "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((ch) => `%${`00${ch.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export default function AgentDashboard() {
  const navigate = useNavigate();
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
  const [compactMode, setCompactMode] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const [displayName, setDisplayName] = useState("Agent");
  const [signature, setSignature] = useState("Support Desk");

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
    const base = draft.trim();
    const content = signatureEnabled && signature.trim()
      ? `${base}\n\n- ${signature.trim()}`
      : base;
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
  const authProfile = decodeJwtPayload(authToken || "");
  const resolvedDisplayName = displayName || authProfile?.agentId || agentId || "Agent";
  const avgWait = queue.length
    ? Math.round(
        queue.reduce((sum, session) => sum + getWaitMinutes(session.escalationRequestedAt), 0) /
          queue.length
      )
    : 0;

  if (!authToken) {
    return (
      <div className="agent-auth-wrap">
        <section className="agent-auth-card modern-auth-card">
          <aside className="auth-visual-panel">
            <div className="auth-visual-top">
              <img src="/sonalogo.png" alt="Sona logo" className="agent-auth-logo" />
              <span>Sona AI Desk</span>
            </div>
            <div className="auth-visual-illustration" aria-hidden="true">
              <div className="shape shape-main" />
              <div className="shape shape-orbit" />
              <div className="shape shape-dot" />
            </div>
            <h3>Welcome back, agent</h3>
            <p>
              Manage escalations, reply in real time, and keep student support seamless across
              admissions workflows.
            </p>
          </aside>

          <div className="auth-form-panel">
            <div className="agent-auth-brand">
              <img src="/sonalogo.png" alt="Sona logo" className="agent-auth-logo" />
              <div>
                <p className="eyebrow">Sona Support Desk</p>
                <h2>Agent Sign In</h2>
              </div>
            </div>
            <p>Sign in with Microsoft or use your secure staff credentials.</p>

            <button
              type="button"
              className="ms-login-btn"
              onClick={onMicrosoftLogin}
              disabled={microsoftLoading}
            >
              <span className="ms-icon" aria-hidden="true">
                <span className="ms-square ms-red" />
                <span className="ms-square ms-green" />
                <span className="ms-square ms-blue" />
                <span className="ms-square ms-yellow" />
              </span>
              <span>{microsoftLoading ? "Signing in..." : "Continue with Microsoft"}</span>
            </button>

            <p className="agent-auth-divider">or continue with username and password</p>

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

            <p className="auth-footnote">
              By signing in, you agree to student data handling and support audit policies.
            </p>
          </div>
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
          <div className="agent-head-actions">
            <button className="pill-btn" onClick={() => navigate("/admin")}>Admin</button>
            <button className="pill-btn" onClick={() => navigate("/status")}>Status</button>
            <button className="ghost-btn" onClick={onLogout}>Logout</button>
          </div>
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
            <h3>{activeSessionId ? `Session ${activeSessionId.slice(-6)} • ${resolvedDisplayName}` : "Select a student"}</h3>
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

        <div className="agent-profile-card">
          <div className="agent-profile-head">
            <strong>Agent Profile Settings</strong>
            <small>{authProfile?.email || authProfile?.agentId || agentId}</small>
          </div>
          <div className="agent-profile-grid">
            <label>
              Display Name
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Agent name" />
            </label>
            <label>
              Signature
              <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Support Desk" />
            </label>
          </div>
          <div className="agent-profile-toggles">
            <label><input type="checkbox" checked={compactMode} onChange={(e) => setCompactMode(e.target.checked)} /> Compact chat mode</label>
            <label><input type="checkbox" checked={showTimestamps} onChange={(e) => setShowTimestamps(e.target.checked)} /> Show timestamps</label>
            <label><input type="checkbox" checked={signatureEnabled} onChange={(e) => setSignatureEnabled(e.target.checked)} /> Auto-append signature</label>
          </div>
        </div>

        <div className={`agent-chat-log ${compactMode ? "compact-chat" : ""}`}>
          {messages.map((message, index) => (
            <div key={`${index}-${message.content.slice(0, 8)}`} className={`bubble ${message.sender}`}>
              <p>{message.content}</p>
              {showTimestamps ? <small>{formatDate(message.createdAt)}</small> : null}
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
