import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { escalateToAgent, fetchHistory, sendStudentMessage } from "../../api";
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
    placeholder: "Ask about fees, cutoffs, scholarships, courses...",
    escalateButton: "Live Agent",
    offHours: "Live agents are available only from 9:00 AM to 5:00 PM IST.",
    requestSent: "Live agent request sent. Please wait while we connect you.",
    requestFailed: "Unable to reach a live agent right now. Please try again.",
    availabilityCompact: "9AM-5PM IST",
  },
  hi: {
    placeholder: "Fees, cutoffs, scholarship, courses ke bare me puchhiye...",
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
    sender: message?.sender || "bot",
    content: String(message?.content || ""),
    createdAt: message?.createdAt || new Date().toISOString(),
    meta: message?.meta || null,
  };
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
          "Fee structure details dijiye",
          "Scholarship eligibility kya hai?",
          "Hostel facilities batayiye",
        ]
      : [
          "Explain the admission process",
          "Share fee structure details",
          "What are scholarship eligibility criteria?",
          "Tell me about hostel facilities",
        ];

  if (!contextText) return base;
  if (contextText.includes("hostel")) {
    return [
      "Hostel fee and room types",
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
  siteContext = null,
  onStudentLogout = null,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [handoffPending, setHandoffPending] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [lastEscalateShownAt, setLastEscalateShownAt] = useState(0);
  const [aiStageIndex, setAiStageIndex] = useState(0);
  const [agentTyping, setAgentTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(socket.connected ? "online" : "offline");
  const [language, setLanguage] = useState(() => localStorage.getItem("chat-lang") || "en");
  const [isAgentAvailable, setIsAgentAvailable] = useState(() => isAgentWithinWorkingHours());
  const [resumeBannerVisible, setResumeBannerVisible] = useState(false);

  const stageIntervalRef = useRef(null);
  const agentTypingTimeoutRef = useRef(null);
  const listRef = useRef(null);

  const text = COPY[language] || COPY.en;

  const stageLabel = useMemo(() => PROCESSING_STAGES[aiStageIndex] || PROCESSING_STAGES[0], [aiStageIndex]);
  const cooldownActive = useMemo(
    () => Date.now() - lastEscalateShownAt < ESCALATE_COOLDOWN_MS,
    [lastEscalateShownAt]
  );
  const starterPrompts = useMemo(() => deriveConversationStarters(siteContext, language), [siteContext, language]);

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
        setHandoffPending(data.status === "queued");
        setAgentConnected(false);
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
        return duplicate ? prev : [...prev, normalized];
      });
    };

    const onAgentJoined = () => {
      setAgentConnected(true);
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

    const onTyping = () => {
      setAgentTyping(true);
      clearTimeout(agentTypingTimeoutRef.current);
      agentTypingTimeoutRef.current = setTimeout(() => {
        setAgentTyping(false);
      }, 1800);
    };

    socket.connect();
    socket.emit("session:join", { sessionId, role: "student", studentId });

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:message", pushMessage);
    socket.on("agent:joined", onAgentJoined);
    socket.on("agent:typing", onTyping);

    return () => {
      clearTimeout(agentTypingTimeoutRef.current);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:message", pushMessage);
      socket.off("agent:joined", onAgentJoined);
      socket.off("agent:typing", onTyping);
    };
  }, [sessionId, studentId]);

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

  const onTyping = () => {
    socket.emit("chat:typing", { sessionId, role: "student" });
  };

  return (
    <motion.section className="cc-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <ChatHeader
        loading={loading}
        sessionId={sessionId}
        connectionStatus={connectionStatus}
        handoffPending={handoffPending}
        agentConnected={agentConnected}
        onEscalate={onEscalate}
        isAgentAvailable={isAgentAvailable}
        agentButtonLabel={text.escalateButton}
        agentAvailabilityLabel={text.availabilityCompact}
        studentDisplayName={studentDisplayName}
        historyCount={historyCount}
        onStudentLogout={onStudentLogout}
        onClose={onClose}
      />

      <div className="cc-body">
        <MessageList
          messages={messages}
          listRef={listRef}
          aiStageLabel={stageLabel}
          isSending={isSending}
          agentTyping={agentTyping}
          onRichAction={sendMessage}
          starterPrompts={messages.length === 0 ? starterPrompts : []}
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

      <div className="cc-footer">
        <InputBox
          value={input}
          loading={isSending}
          disabled={!sessionId}
          onChange={setInput}
          onSend={sendMessage}
          onTyping={onTyping}
          placeholder={text.placeholder}
        />
      </div>
    </motion.section>
  );
}
