import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAgentQueue,
  fetchHistory,
  getAgentToken,
  joinAgentSession,
  resolveSession,
  setAgentToken,
  sendAgentMessage,
} from "../api";
import { socket } from "../socket";
import Sidebar from "../components/agent/Sidebar";
import ChatWindow from "../components/agent/ChatWindow";

function normalizeSessionId(session) {
  return session?._id || session?.id;
}

function getWaitMinutes(escalationRequestedAt) {
  if (!escalationRequestedAt) return 0;
  const deltaMs = Date.now() - new Date(escalationRequestedAt).getTime();
  return Math.max(0, Math.round(deltaMs / 60000));
}

function getStudentLabel(session) {
  return session?.studentEmail || session?.studentName || session?.studentId || "student";
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
  const listRef = useRef(null);

  const [authToken, setAuthToken] = useState(() => getAgentToken());
  const [agentId] = useState("agent");
  const [queue, setQueue] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [showTimestamps] = useState(true);
  const [signatureEnabled] = useState(false);
  const [displayName] = useState("Agent");
  const [signature] = useState("Support Desk");
  const [studentTyping, setStudentTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [showMobileQueue, setShowMobileQueue] = useState(() => window.innerWidth <= 1024);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 1024;
      setIsMobile(mobile);
      if (!mobile) setShowMobileQueue(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    let typingTimer = null;
    const onStudentTyping = () => {
      setStudentTyping(true);
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setStudentTyping(false), 1500);
    };

    socket.on("queue:updated", refreshQueue);
    socket.on("chat:message", onMessage);
    socket.on("chat:typing", onStudentTyping);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    const pollId = setInterval(refreshQueue, 20000);
    refreshQueue();
    setSocketConnected(socket.connected);

    return () => {
      socket.off("queue:updated", refreshQueue);
      socket.off("chat:message", onMessage);
      socket.off("chat:typing", onStudentTyping);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      if (typingTimer) clearTimeout(typingTimer);
      clearInterval(pollId);
    };
  }, [agentId, authToken]);

  useEffect(() => {
    if (!authToken || activeSessionId || queue.length === 0) return;
    const firstId = normalizeSessionId(queue[0]);
    if (!firstId) return;
    openSession(firstId).catch((error) => {
      console.error("Unable to auto-open first session", error);
    });
  }, [authToken, queue, activeSessionId]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, studentTyping]);

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
    navigate("/login", { replace: true });
  }

  async function openSession(sessionId) {
    await joinAgentSession(sessionId, agentId);
    socket.emit("session:join", { sessionId, role: "agent", token: authToken });
    setActiveSessionId(sessionId);
    if (isMobile) setShowMobileQueue(false);

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

  const authProfile = decodeJwtPayload(authToken || "");
  const resolvedDisplayName = displayName || authProfile?.agentId || agentId || "Agent";
  const avgWait = queue.length
    ? Math.round(
        queue.reduce((sum, session) => sum + getWaitMinutes(session.escalationRequestedAt), 0) /
          queue.length
      )
    : 0;

  const filteredQueue = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return queue;
    return queue.filter((session) => {
      const label = getStudentLabel(session).toLowerCase();
      const id = String(session.studentId || "").toLowerCase();
      return label.includes(query) || id.includes(query);
    });
  }, [queue, search]);

  const activeQueueSession = queue.find((session) => normalizeSessionId(session) === activeSessionId);

  if (!authToken) return null;

  return (
    <div className="ad-shell">
      {isMobile ? (
        <div className="ad-mobile-toolbar">
          <button type="button" className="pill-btn" onClick={() => setShowMobileQueue((v) => !v)}>
            {showMobileQueue ? "Back to Chat" : "Open Queue"}
          </button>
        </div>
      ) : null}

      {(!isMobile || showMobileQueue) ? (
        <Sidebar
          queue={filteredQueue}
          activeSessionId={activeSessionId}
          onOpenSession={openSession}
          socketConnected={socketConnected}
          lastSyncAt={lastSyncAt}
          queueLoading={queueLoading}
          queueError={queueError}
          avgWait={avgWait}
          search={search}
          onSearchChange={setSearch}
          onOpenAdmin={() => navigate("/admin")}
          onOpenStatus={() => navigate("/status")}
          onLogout={onLogout}
        />
      ) : null}

      {(!isMobile || !showMobileQueue) ? (
        <ChatWindow
          activeQueueSession={activeQueueSession}
          activeSessionId={activeSessionId}
          resolvedDisplayName={resolvedDisplayName}
          authEmail={authProfile?.email || authProfile?.agentId || agentId}
          messages={messages}
          showTimestamps={showTimestamps}
          studentTyping={studentTyping}
          draft={draft}
          onDraftChange={setDraft}
          onSend={sendMessage}
          onTyping={() => socket.emit("agent:typing", { sessionId: activeSessionId })}
          onResolve={markResolved}
          listRef={listRef}
          isMobile={isMobile}
          onBackToQueue={() => setShowMobileQueue(true)}
        />
      ) : null}
    </div>
  );
}
