import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAgentReport,
  fetchAgentQueue,
  fetchHistory,
  getAgentToken,
  joinAgentSession,
  resolveSession,
  setAgentToken,
  sendAgentMessage,
} from "../api";
import { downloadDashboardReportPdf } from "../utils/reportPdf";
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
  return session?.studentName || session?.studentEmail || session?.studentId || "student";
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
  const activeSessionIdRef = useRef("");

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
  const [activeSessionStatus, setActiveSessionStatus] = useState("bot");
  const [showTimestamps] = useState(true);
  const [signatureEnabled] = useState(false);
  const [displayName] = useState("Agent");
  const [signature] = useState("Support Desk");
  const [studentTyping, setStudentTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [showMobileQueue, setShowMobileQueue] = useState(() => window.innerWidth <= 1024);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);
  const [reportRange, setReportRange] = useState("week");
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  function emitSeenReceipt(sessionId) {
    if (!sessionId) return;
    socket.emit("agent:seen", {
      sessionId,
      seenAt: new Date().toISOString(),
    });
  }

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
      const messageSessionId = String(message?.sessionId || "");
      const currentSessionId = String(activeSessionIdRef.current || "");
      if (messageSessionId && currentSessionId && messageSessionId !== currentSessionId) {
        return;
      }

      setMessages((prev) => [...prev, message]);

      if (
        String(message?.sender || "") === "system" &&
        String(message?.content || "").toLowerCase().includes("conversation resolved by")
      ) {
        setActiveSessionStatus("resolved");
        setDraft("");
      }

      if (String(message?.sender || "") === "student" && currentSessionId) {
        emitSeenReceipt(currentSessionId);
      }
    };

    const onSeen = ({ sessionId, seenAt, agentId: seenByAgentId }) => {
      const currentSessionId = String(activeSessionIdRef.current || "");
      if (!currentSessionId || String(sessionId || "") !== currentSessionId) return;
      if (!seenAt) return;
      setMessages((prev) =>
        prev.map((message) => {
          if (String(message?.sender || "") !== "student") return message;
          const meta = message?.meta || {};
          return {
            ...message,
            meta: {
              ...meta,
              seenByAgentAt: seenAt,
              seenByAgentId: seenByAgentId || meta.seenByAgentId || "",
            },
          };
        })
      );
    };

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onResolved = ({ sessionId }) => {
      const currentSessionId = String(activeSessionIdRef.current || "");
      if (!currentSessionId || String(sessionId || "") !== currentSessionId) return;
      setActiveSessionStatus("resolved");
      setDraft("");
    };
    let typingTimer = null;
    const onStudentTyping = () => {
      setStudentTyping(true);
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setStudentTyping(false), 1500);
    };

    socket.on("queue:updated", refreshQueue);
    socket.on("chat:message", onMessage);
    socket.on("chat:seen", onSeen);
    socket.on("chat:typing", onStudentTyping);
    socket.on("chat:resolved", onResolved);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    const pollId = setInterval(refreshQueue, 20000);
    refreshQueue();
    setSocketConnected(socket.connected);

    return () => {
      socket.off("queue:updated", refreshQueue);
      socket.off("chat:message", onMessage);
      socket.off("chat:seen", onSeen);
      socket.off("chat:typing", onStudentTyping);
      socket.off("chat:resolved", onResolved);
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
    setActiveSessionStatus(String(session.status || "bot"));
    emitSeenReceipt(sessionId);

    const updatedQueue = await fetchAgentQueue();
    setQueue(updatedQueue);
  }

  async function sendMessage() {
    if (!activeSessionId || !draft.trim() || activeSessionStatus === "resolved") return;
    const base = draft.trim();
    const content = signatureEnabled && signature.trim()
      ? `${base}\n\n- ${signature.trim()}`
      : base;
    setDraft("");
    try {
      await sendAgentMessage(activeSessionId, content, agentId);
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      if (status === 409) {
        setActiveSessionStatus("resolved");
        setQueueError("This session is already resolved. Sending new messages is disabled.");
        return;
      }
      throw error;
    }
  }

  async function markResolved() {
    if (!activeSessionId) return;
    await resolveSession(activeSessionId, agentId);
    setActiveSessionStatus("resolved");
    setDraft("");
    const updatedQueue = await fetchAgentQueue();
    setQueue(updatedQueue);
  }

  async function onDownloadAgentReport() {
    setReportLoading(true);
    setQueueError("");
    try {
      const report = await fetchAgentReport(reportRange);
      const summary = report?.summary || {};
      const items = Array.isArray(report?.items) ? report.items : [];

      const tableRows = items.map((item) => [
        String(item.sessionId || "-").slice(-8),
        item.studentId || "-",
        item.status || "-",
        item.messageCount ?? 0,
        item.resolvedAt ? "Yes" : "No",
        item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-",
      ]);

      downloadDashboardReportPdf({
        title: `Agent Report - ${resolvedDisplayName}`,
        range: report?.range || reportRange,
        generatedAt: report?.generatedAt || new Date().toISOString(),
        startDate: report?.startDate,
        summaryRows: [
          { label: "Total Sessions", value: summary.totalSessions ?? 0 },
          { label: "Active", value: summary.activeSessions ?? 0 },
          { label: "Resolved", value: summary.resolvedSessions ?? 0 },
          { label: "Escalated", value: summary.escalatedSessions ?? 0 },
          { label: "Avg Resolution (min)", value: summary.avgResolutionMinutes ?? 0 },
        ],
        tableColumns: ["Session", "Student", "Status", "Messages", "Resolved", "Updated"],
        tableRows,
        fileName: `agent-report-${report?.range || reportRange}.pdf`,
      });
    } catch (error) {
      console.error(error);
      setQueueError("Unable to download report right now.");
    } finally {
      setReportLoading(false);
    }
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
  const canReply = Boolean(activeSessionId) && activeSessionStatus !== "resolved";

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
          reportRange={reportRange}
          onReportRangeChange={setReportRange}
          onDownloadReport={onDownloadAgentReport}
          reportLoading={reportLoading}
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
          canReply={canReply}
          isResolved={activeSessionStatus === "resolved"}
          listRef={listRef}
          isMobile={isMobile}
          onBackToQueue={() => setShowMobileQueue(true)}
        />
      ) : null}
    </div>
  );
}
