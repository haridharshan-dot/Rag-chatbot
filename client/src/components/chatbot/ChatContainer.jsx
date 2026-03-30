import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  analyzeStudentDocument,
  clearStudentChat,
  escalateToAgent,
  fetchChatNotifications,
  fetchHistory,
  sendStudentMessage,
} from "../../api";
import { socket } from "../../socket";
import { trackChatFunnelEvent } from "../../utils/chatAnalytics";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import InputBox from "./InputBox";

const PROCESSING_STAGES = [
  "Analyzing your query...",
  "Searching college database...",
  "Generating response...",
];
const ESCALATE_COOLDOWN_MS = 2 * 60 * 1000;
const AGENT_TIMEZONE = "Asia/Kolkata";
const AGENT_START_HOUR = 9;
const AGENT_END_HOUR = 17;

const COPY = {
  en: {
    placeholder: "Ask about cutoffs, scholarships, courses, admissions...",
    escalateButton: "Live Agent",
    offHours: "Live agents are available only from 9:00 AM to 5:00 PM IST.",
    requestSent: "Live agent request sent. Please wait while we connect you.",
    requestFailed: "Unable to reach a live agent right now. Please try again.",
    availabilityCompact: "9AM-5PM IST",
  },
  hi: {
    placeholder: "Cutoffs, scholarship, courses, admissions ke bare me puchhiye...",
    escalateButton: "Live Agent",
    offHours: "Live agent sirf 9:00 AM se 5:00 PM IST tak available hain.",
    requestSent: "Live agent request bhej diya gaya hai. Kripya wait karein.",
    requestFailed: "Abhi live agent se connect nahi ho pa raha. Kripya dubara try karein.",
    availabilityCompact: "9AM-5PM IST",
  },
};

function getCurrentHourInTimezone(timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);
  return Number.isFinite(hour) ? hour : 0;
}

function isAgentWithinWorkingHours() {
  const hour = getCurrentHourInTimezone(AGENT_TIMEZONE);
  return hour >= AGENT_START_HOUR && hour < AGENT_END_HOUR;
}

function normalizeMessage(message) {
  return {
    sessionId: message?.sessionId || "",
    sender: message?.sender || "bot",
    content: String(message?.content || ""),
    createdAt: message?.createdAt || new Date().toISOString(),
    meta: message?.meta || null,
  };
}

function deriveLatestSeenMeta(history) {
  if (!Array.isArray(history) || history.length === 0) return { seenAt: "", agentId: "" };
  let latest = null;
  for (const message of history) {
    if (String(message?.sender || "") !== "student") continue;
    const seenAt = String(message?.meta?.seenByAgentAt || "").trim();
    if (!seenAt) continue;
    const seenDate = new Date(seenAt);
    if (Number.isNaN(seenDate.getTime())) continue;
    if (!latest || seenDate.getTime() > latest.seenDate.getTime()) {
      latest = {
        seenDate,
        seenAt,
        agentId: String(message?.meta?.seenByAgentId || "").trim(),
      };
    }
  }
  return latest ? { seenAt: latest.seenAt, agentId: latest.agentId } : { seenAt: "", agentId: "" };
}

function isAgentJoinMessage(message) {
  const sender = String(message?.sender || "");
  const content = String(message?.content || "");
  if (sender !== "system") return false;
  return /^Agent\s+.+\s+joined the conversation\.?$/i.test(content.trim());
}

function messageSuggestsAgent(content) {
  const text = String(content || "").toLowerCase();
  if (!text) return false;
  return (
    text.includes("connect to a live agent") ||
    text.includes("connect you to a live agent") ||
    text.includes("human agent") ||
    text.includes("live agent support")
  );
}

function isLiveAgentRequestIntent(content) {
  const text = String(content || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return false;

  const liveAgentTerms = /\b(live agent|agent|human|representative|counselor|counsellor|admission office|admission team|staff|someone)\b/;
  const requestTerms = /\b(talk|speak|connect|chat|transfer|contact|need|want|assist|help)\b/;
  const directPatterns =
    /\b(i want to talk|i need to talk|connect me|transfer me|can i talk|talk to someone|talk to agent|speak to agent|speak with|contact admission)\b/;

  return directPatterns.test(text) || (liveAgentTerms.test(text) && requestTerms.test(text));
}

function shouldTriggerEscalationFromMessage(message) {
  const meta = message?.meta || {};
  return Boolean(
    meta?.outOfScope ||
    meta?.escalationSuggested ||
    messageSuggestsAgent(message?.content)
  );
}

function deriveConversationStarters(siteContext, fallbackLanguage = "en") {
  const contextText = [
    siteContext?.title,
    siteContext?.url,
    siteContext?.description,
    ...(Array.isArray(siteContext?.headings) ? siteContext.headings : []),
  ]
    .join(" ")
    .toLowerCase();

  const base =
    fallbackLanguage === "hi"
      ? [
          "Admission process explain kijiye",
          "Cutoff details share kijiye",
          "Scholarship eligibility kya hai?",
          "Hostel facilities batayiye",
        ]
      : [
          "Explain the admission process",
          "Share cutoff details",
          "What are scholarship eligibility criteria?",
          "Tell me about hostel facilities",
        ];

  if (!contextText) return base;
  if (contextText.includes("hostel")) {
    return [
      "Hostel facilities and room types",
      "Hostel rules and timing",
      "Mess and transport options",
      "How to apply for hostel",
    ];
  }
  if (contextText.includes("scholarship")) {
    return [
      "Available scholarships",
      "Merit cutoff for scholarship",
      "Documents needed for scholarship",
      "Scholarship renewal rules",
    ];
  }
  if (contextText.includes("admission")) {
    return [
      "Admission timeline and last dates",
      "Eligibility by department",
      "How to apply online",
      "Required documents checklist",
    ];
  }
  return base;
}

export default function ChatContainer({
  sessionId,
  studentId,
  loading,
  isFullscreen,
  setFullscreen,
  onClose,
  studentDisplayName = "",
  historyCount = 0,
  onSessionSnapshot = null,
  siteContext = null,
  onStudentLogout = null,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [handoffPending, setHandoffPending] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [agentSessionEnded, setAgentSessionEnded] = useState(false);
  const [activeChannel, setActiveChannel] = useState("ai");
  const [lastEscalateShownAt, setLastEscalateShownAt] = useState(0);
  const [aiStageIndex, setAiStageIndex] = useState(0);
  const [agentTyping, setAgentTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(socket.connected ? "online" : "offline");
  const [language, setLanguage] = useState(() => localStorage.getItem("chat-lang") || "en");
  const [isAgentAvailable, setIsAgentAvailable] = useState(() => isAgentWithinWorkingHours());
  const [resumeBannerVisible, setResumeBannerVisible] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [seenMeta, setSeenMeta] = useState({ seenAt: "", agentId: "" });

  const stageIntervalRef = useRef(null);
  const agentTypingTimeoutRef = useRef(null);
  const listRef = useRef(null);

  const text = COPY[language] || COPY.en;
  const studentName = String(studentDisplayName || "").trim();
  const firstName = studentName ? studentName.split(/\s+/)[0] : "";

  const stageLabel = useMemo(() => PROCESSING_STAGES[aiStageIndex] || PROCESSING_STAGES[0], [aiStageIndex]);
  const cooldownActive = useMemo(
    () => Date.now() - lastEscalateShownAt < ESCALATE_COOLDOWN_MS,
    [lastEscalateShownAt]
  );
  const starterPrompts = useMemo(() => deriveConversationStarters(siteContext, language), [siteContext, language]);
  const visibleMessages = useMemo(() => {
    if (!agentConnected && !agentSessionEnded) return messages;

    const handoffNoticeIndex = messages.findIndex((message) => {
      const sender = String(message?.sender || "");
      const content = String(message?.content || "").toLowerCase();
      return sender === "system" && content.includes("connected to a live agent");
    });
    const firstAgentMessageIndex = messages.findIndex(
      (message) => String(message?.sender || "") === "agent"
    );
    const agentPhaseStartIndex =
      handoffNoticeIndex >= 0
        ? handoffNoticeIndex + 1
        : firstAgentMessageIndex >= 0
          ? firstAgentMessageIndex
          : -1;

    if (activeChannel === "agent") {
      return messages.filter((message, index) => {
        const sender = String(message?.sender || "");
        const content = String(message?.content || "").toLowerCase();
        const isResolvedNotice = sender === "system" && content.includes("resolved");
        if (sender !== "student" && sender !== "agent" && !isResolvedNotice) return false;
        if (isResolvedNotice) return true;
        if (agentPhaseStartIndex < 0) return true;
        return index >= agentPhaseStartIndex;
      });
    }

    return messages.filter((message) => {
      const sender = String(message?.sender || "");
      return sender === "student" || sender === "bot";
    });
  }, [messages, agentConnected, agentSessionEnded, activeChannel]);
  const endedAgentTabActive = agentSessionEnded && activeChannel === "agent";
  const inputPlaceholder = endedAgentTabActive
    ? "Agent session ended. Switch to AI Chat to continue."
    : activeChannel === "agent" && agentConnected
      ? `${firstName ? `${firstName}, ` : ""}type your message for the live agent...`
      : text.placeholder;

  useEffect(() => {
    localStorage.setItem("chat-lang", language);
  }, [language]);

  useEffect(() => {
    const refreshAvailability = () => {
      setIsAgentAvailable(isAgentWithinWorkingHours());
    };

    refreshAvailability();
    const timer = setInterval(refreshAvailability, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    try {
      const raw = sessionStorage.getItem(`cc-escalate-shown:${sessionId}`);
      const parsed = Number(raw || 0);
      if (Number.isFinite(parsed) && parsed > 0) {
        setLastEscalateShownAt(parsed);
      } else {
        setLastEscalateShownAt(0);
      }
    } catch {
      setLastEscalateShownAt(0);
    }

    fetchHistory(sessionId)
      .then((data) => {
        const history = Array.isArray(data.messages)
          ? data.messages
              .map(normalizeMessage)
              .filter((message) => !isAgentJoinMessage(message))
          : [];
        setMessages(history);
        setSeenMeta(deriveLatestSeenMeta(history));
        setHandoffPending(data.status === "queued");
        const connectedToAgent = data.status === "active";
        setAgentConnected(connectedToAgent);
        setAgentSessionEnded(data.status === "resolved");
        if (connectedToAgent) {
          setActiveChannel("agent");
        } else if (data.status === "resolved") {
          setActiveChannel("agent");
        } else {
          setActiveChannel("ai");
        }
      })
      .catch((error) => {
        console.error("Unable to load history", error);
      });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const onConnect = () => setConnectionStatus("online");
    const onDisconnect = () => setConnectionStatus("offline");

    const pushMessage = (nextMessage) => {
      const normalized = normalizeMessage(nextMessage);
      if (isAgentJoinMessage(normalized)) {
        return;
      }
      setMessages((prev) => {
        const duplicate = prev.slice(-5).some(
          (item) =>
            item.sender === normalized.sender &&
            item.content === normalized.content &&
            item.createdAt === normalized.createdAt
        );
        if (duplicate) return prev;
        return [...prev, normalized];
      });

      if (String(normalized?.sender || "") === "student") {
        const seenAt = String(normalized?.meta?.seenByAgentAt || "").trim();
        if (seenAt) {
          setSeenMeta({
            seenAt,
            agentId: String(normalized?.meta?.seenByAgentId || "").trim(),
          });
        }
      }
    };

    const onAgentJoined = () => {
      setAgentConnected(true);
      setAgentSessionEnded(false);
      setActiveChannel("agent");
      setHandoffPending(false);
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: `${firstName ? `Hi ${firstName}, ` : ""}you are now connected to a live agent. AI replies are paused until the conversation is resolved.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    };

    const onTyping = () => {
      setAgentTyping(true);
      clearTimeout(agentTypingTimeoutRef.current);
      agentTypingTimeoutRef.current = setTimeout(() => {
        setAgentTyping(false);
      }, 1800);
    };

    const onSeen = ({ sessionId: seenSessionId, seenAt, agentId }) => {
      if (!seenAt) return;
      if (String(seenSessionId || "") !== String(sessionId || "")) return;
      setSeenMeta({
        seenAt: String(seenAt),
        agentId: String(agentId || "").trim(),
      });
      setMessages((prev) =>
        prev.map((message) => {
          if (String(message?.sender || "") !== "student") return message;
          return {
            ...message,
            meta: {
              ...(message?.meta || {}),
              seenByAgentAt: String(seenAt),
              seenByAgentId: String(agentId || "").trim(),
            },
          };
        })
      );
    };

    const onCleared = () => {
      fetchHistory(sessionId)
        .then((data) => {
          const history = Array.isArray(data.messages)
            ? data.messages
                .map(normalizeMessage)
                .filter((message) => !isAgentJoinMessage(message))
            : [];
          setMessages(history);
          setSeenMeta(deriveLatestSeenMeta(history));
          setHandoffPending(false);
          setAgentConnected(false);
          setAgentSessionEnded(false);
          setActiveChannel("ai");
        })
        .catch((error) => {
          console.error("Unable to refresh chat after clear", error);
        });
    };

    const onResolved = ({ sessionId: resolvedSessionId }) => {
      if (String(resolvedSessionId || "") !== String(sessionId || "")) return;
      setAgentConnected(false);
      setAgentSessionEnded(true);
      setHandoffPending(false);
      setAgentTyping(false);
      setActiveChannel("agent");
      setMessages((prev) => {
        const alreadyHasNotice = prev.some((message) => {
          const sender = String(message?.sender || "");
          const content = String(message?.content || "").toLowerCase();
          return sender === "system" && (content.includes("session ended") || content.includes("live agent session ended"));
        });
        if (alreadyHasNotice) return prev;
        return [
          ...prev,
          {
            sender: "system",
            content: "Live agent session ended. You can continue with AI now.",
            createdAt: new Date().toISOString(),
          },
        ];
      });
    };

    socket.connect();
    socket.emit("session:join", { sessionId, role: "student", studentId });

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:message", pushMessage);
    socket.on("agent:joined", onAgentJoined);
    socket.on("agent:typing", onTyping);
    socket.on("chat:seen", onSeen);
    socket.on("chat:cleared", onCleared);
    socket.on("chat:resolved", onResolved);

    return () => {
      clearTimeout(agentTypingTimeoutRef.current);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:message", pushMessage);
      socket.off("agent:joined", onAgentJoined);
      socket.off("agent:typing", onTyping);
      socket.off("chat:seen", onSeen);
      socket.off("chat:cleared", onCleared);
      socket.off("chat:resolved", onResolved);
    };
  }, [sessionId, studentId, firstName]);

  useEffect(() => {
    if (!agentConnected && !agentSessionEnded && activeChannel !== "ai") {
      setActiveChannel("ai");
    }
  }, [agentConnected, agentSessionEnded, activeChannel]);

  useEffect(() => {
    if (!studentDisplayName || !historyCount) {
      setResumeBannerVisible(false);
      return;
    }
    const key = `cc-resume-dismissed:${studentDisplayName}`;
    try {
      const dismissed = localStorage.getItem(key) === "1";
      setResumeBannerVisible(!dismissed);
    } catch {
      setResumeBannerVisible(true);
    }
  }, [historyCount, studentDisplayName]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending, agentTyping]);

  useEffect(() => {
    if (!sessionId || !onSessionSnapshot) return;
    onSessionSnapshot({
      _id: sessionId,
      id: sessionId,
      updatedAt: new Date().toISOString(),
      messages,
    });
  }, [messages, onSessionSnapshot, sessionId]);

  useEffect(() => {
    return () => {
      clearInterval(stageIntervalRef.current);
      clearTimeout(agentTypingTimeoutRef.current);
    };
  }, []);

  const startProcessingStages = () => {
    setAiStageIndex(0);
    clearInterval(stageIntervalRef.current);
    stageIntervalRef.current = setInterval(() => {
      setAiStageIndex((value) => (value + 1) % PROCESSING_STAGES.length);
    }, 1100);
  };

  const stopProcessingStages = () => {
    clearInterval(stageIntervalRef.current);
    stageIntervalRef.current = null;
    setAiStageIndex(0);
  };

  const sendMessage = async (forcedMessage = "") => {
    const content = String(forcedMessage || input).trim();
    if (!content || !sessionId || isSending) return;

    if (isLiveAgentRequestIntent(content)) {
      setInput("");
      if (agentConnected) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            content: "Yes sir, you are in the right place. You are in live agent only. How can I help you?",
            createdAt: new Date().toISOString(),
          },
        ]);
      } else if (handoffPending) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            content: "Your live agent request is active. Please wait, an agent will assist you shortly.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            content: "The live agent option is on top. Please activate it and talk to a live agent.",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      return;
    }

    setInput("");
    setIsSending(true);
    startProcessingStages();

    try {
      let response;
      try {
        response = await sendStudentMessage(sessionId, content);
      } catch (firstError) {
        // Do not retry timeout requests; it doubles wait time in UI.
        const isRetriable =
          firstError?.code !== "ECONNABORTED" &&
          (!firstError?.response || firstError?.response?.status >= 500);

        if (!isRetriable) {
          throw firstError;
        }

        // Retry once only for transient server/network failures.
        response = await sendStudentMessage(sessionId, content);
      }

      const status = String(response.sessionStatus || "bot");
      const botText = String(response?.botMessage?.content || "");
      const shouldShowEscalate = Boolean(
        status === "queued" ||
        response.autoEscalated ||
        response.escalationSuggested ||
        response.outOfScope ||
        messageSuggestsAgent(botText)
      );

      if (status !== "queued" && shouldShowEscalate && !cooldownActive) {
        const now = Date.now();
        setLastEscalateShownAt(now);
        try {
          sessionStorage.setItem(`cc-escalate-shown:${sessionId}`, String(now));
        } catch {
          // Ignore storage errors and keep in-memory cooldown.
        }
      }

      setHandoffPending(status === "queued" || Boolean(response.autoEscalated));
      if (status !== "active") {
        setAgentConnected(false);
        if (status !== "resolved") {
          setAgentSessionEnded(false);
        }
      } else {
        setAgentConnected(true);
        setAgentSessionEnded(false);
        setActiveChannel("agent");
      }
    } catch (error) {
      console.error("Failed to send message", error);
      const serverMessage = String(error?.response?.data?.message || "").trim();
      const uiMessage = serverMessage || "We hit a network issue. Please try again.";

      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: uiMessage,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      stopProcessingStages();
      setIsSending(false);
    }
  };

  const onEscalate = async () => {
    if (!sessionId) return;
    if (!isAgentAvailable) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: text.offHours,
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }

    try {
      await escalateToAgent(sessionId);
      trackChatFunnelEvent("agent_escalation");
      setHandoffPending(true);
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: text.requestSent,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Escalation failed", error);
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: text.requestFailed,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  const onShowAlerts = async () => {
    if (!sessionId) return;
    try {
      const data = await fetchChatNotifications(sessionId);
      const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
      if (!alerts.length) return;
      const formatted = alerts.map((item) => `- ${item.title}: ${item.detail}`).join("\n");
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          content: `Admission Alerts\n${formatted}\nOfficial website: ${data.officialWebsite || ""}`.trim(),
          createdAt: new Date().toISOString(),
          meta: {
            suggestions: ["Admission process", "Required documents", "Talk to agent"],
          },
        },
      ]);
    } catch (error) {
      console.error("Unable to load alerts", error);
    }
  };

  const onAnalyzeDocument = async ({ fileName, extractedText }) => {
    if (!sessionId) return;
    try {
      const result = await analyzeStudentDocument(sessionId, { fileName, extractedText });
      const message = result?.detectedCutoff
        ? `Document analyzed. Detected marks/cutoff: ${result.detectedCutoff}.`
        : "Document analyzed. Could not detect marks clearly, please type your cutoff manually.";
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          content: message,
          createdAt: new Date().toISOString(),
          meta: {
            suggestions: ["Recommend best courses", "Check eligibility", "Talk to agent"],
          },
        },
      ]);
    } catch (error) {
      const serverMessage = String(error?.response?.data?.message || "").trim();
      const uiMessage = serverMessage || "Document analysis failed. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: uiMessage,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  const onTyping = () => {
    socket.emit("chat:typing", { sessionId, role: "student" });
  };

  const onClearChat = async () => {
    if (!sessionId || clearBusy) return;
    const confirmed = window.confirm("Clear this chat conversation?");
    if (!confirmed) return;

    setClearBusy(true);
    try {
      await clearStudentChat(sessionId);
      const data = await fetchHistory(sessionId);
      const history = Array.isArray(data.messages)
        ? data.messages
            .map(normalizeMessage)
            .filter((message) => !isAgentJoinMessage(message))
        : [];
      setMessages(history);
      setSeenMeta(deriveLatestSeenMeta(history));
      setHandoffPending(false);
      setAgentConnected(false);
      setAgentSessionEnded(false);
    } catch (error) {
      const serverMessage = String(error?.response?.data?.message || "").trim();
      const uiMessage = serverMessage || "Unable to clear chat right now. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: uiMessage,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setClearBusy(false);
    }
  };

  return (
    <motion.section className="cc-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <ChatHeader
        loading={loading}
        sessionId={sessionId}
        connectionStatus={connectionStatus}
        handoffPending={handoffPending}
        agentConnected={agentConnected}
        showChannelTabs={agentConnected || agentSessionEnded}
        aiTabLabel="AI Chat"
        agentTabLabel={agentConnected ? "Agent Live" : agentSessionEnded ? "Agent Ended" : "Agent Live"}
        activeChannel={activeChannel}
        onChannelChange={setActiveChannel}
        onEscalate={onEscalate}
        isAgentAvailable={isAgentAvailable}
        agentButtonLabel={text.escalateButton}
        agentAvailabilityLabel={text.availabilityCompact}
        studentDisplayName={studentDisplayName}
        historyCount={historyCount}
        onClearChat={onClearChat}
        clearBusy={clearBusy}
        onStudentLogout={onStudentLogout}
        onShowAlerts={onShowAlerts}
        onClose={onClose}
      />

      <div className="cc-body">
        <div className="cc-chat-column">
          <MessageList
            messages={visibleMessages}
            seenMeta={seenMeta}
            listRef={listRef}
            aiStageLabel={stageLabel}
            isSending={isSending && activeChannel === "ai"}
            agentTyping={agentTyping && activeChannel === "agent"}
            onRichAction={sendMessage}
            starterPrompts={messages.length === 0 && activeChannel === "ai" ? starterPrompts : []}
            onStarterClick={sendMessage}
            resumeBannerVisible={resumeBannerVisible}
            historyCount={historyCount}
            onResume={() => {
              setResumeBannerVisible(false);
              sendMessage("Please summarize my previous chats and continue from there.");
            }}
            onDismissResume={() => {
              setResumeBannerVisible(false);
              try {
                localStorage.setItem(`cc-resume-dismissed:${studentDisplayName}`, "1");
              } catch {
                // Ignore local storage failures.
              }
            }}
          />
        </div>
      </div>

      <div className="cc-footer">
        <InputBox
          value={input}
          loading={isSending}
          disabled={!sessionId || endedAgentTabActive}
          onChange={setInput}
          onSend={sendMessage}
          onTyping={onTyping}
          onAnalyzeDocument={onAnalyzeDocument}
          placeholder={inputPlaceholder}
        />
      </div>
    </motion.section>
  );
}
