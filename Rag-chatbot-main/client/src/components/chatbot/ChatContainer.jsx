import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { escalateToAgent, fetchHistory, sendStudentMessage } from "../../api";
import { socket } from "../../socket";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import SuggestionChips from "./SuggestionChips";
import InputBox from "./InputBox";
import AgentStatusBanner from "./AgentStatusBanner";

const PROCESSING_STAGES = [
  "Analyzing your query...",
  "Searching college database...",
  "Generating response...",
];
const ESCALATE_COOLDOWN_MS = 2 * 60 * 1000;

const COPY = {
  en: {
    placeholder: "Ask about fees, cutoffs, scholarships, courses...",
    suggestions: ["Check CSE fees", "Cutoff for AI/ML", "Hostel fees", "Admission deadlines"],
    connectAgent: "I am not fully confident. Connecting you to a human agent...",
    escalateButton: "Talk to Human Agent",
    connecting: "Connecting to agent...",
    joined: "Agent joined the chat",
  },
  hi: {
    placeholder: "Fees, cutoffs, scholarship, courses ke bare me puchhiye...",
    suggestions: ["CSE fees", "AI/ML cutoff", "Hostel fees", "Admission deadline"],
    connectAgent: "Mujhe full confidence nahi hai. Human agent se connect kar raha hu...",
    escalateButton: "Human Agent se baat karein",
    connecting: "Agent se connect ho raha hai...",
    joined: "Agent chat me join ho gaya",
  },
};

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

export default function ChatContainer({ sessionId, studentId, loading, isFullscreen, setFullscreen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [handoffPending, setHandoffPending] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [lastEscalateShownAt, setLastEscalateShownAt] = useState(0);
  const [aiStageIndex, setAiStageIndex] = useState(0);
  const [agentTyping, setAgentTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(socket.connected ? "online" : "offline");
  const [language, setLanguage] = useState(() => localStorage.getItem("chat-lang") || "en");

  const stageIntervalRef = useRef(null);
  const agentTypingTimeoutRef = useRef(null);
  const listRef = useRef(null);

  const text = COPY[language] || COPY.en;

  const stageLabel = useMemo(() => PROCESSING_STAGES[aiStageIndex] || PROCESSING_STAGES[0], [aiStageIndex]);
  const cooldownActive = useMemo(
    () => Date.now() - lastEscalateShownAt < ESCALATE_COOLDOWN_MS,
    [lastEscalateShownAt]
  );

  const agentBanner = useMemo(() => {
    if (agentConnected) return { label: text.joined, type: "success" };
    if (handoffPending) return { label: text.connecting, type: "warning" };
    return null;
  }, [agentConnected, handoffPending, text.joined, text.connecting]);

  useEffect(() => {
    localStorage.setItem("chat-lang", language);
  }, [language]);

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
        const latestBotLikeMessage = [...history].reverse().find((msg) => msg?.sender === "bot" || msg?.sender === "system");
        setShowEscalate(data.status === "queued" || shouldTriggerEscalationFromMessage(latestBotLikeMessage));
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
      if (shouldTriggerEscalationFromMessage(normalized)) {
        setShowEscalate(true);
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
      setShowEscalate(true);
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

      if (status === "queued") {
        setShowEscalate(true);
      } else if (shouldShowEscalate && !cooldownActive) {
        const now = Date.now();
        setLastEscalateShownAt(now);
        try {
          sessionStorage.setItem(`cc-escalate-shown:${sessionId}`, String(now));
        } catch {
          // Ignore storage errors and keep in-memory cooldown.
        }
        setShowEscalate(true);
      } else if (!shouldShowEscalate) {
        setShowEscalate(false);
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
    try {
      await escalateToAgent(sessionId);
      setShowEscalate(true);
      setHandoffPending(true);
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          content: text.connecting,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Escalation failed", error);
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
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setFullscreen((value) => !value)}
        onClose={onClose}
        language={language}
        onChangeLanguage={setLanguage}
      />

      <AgentStatusBanner status={agentBanner} />

      <MessageList
        messages={messages}
        listRef={listRef}
        aiStageLabel={stageLabel}
        isSending={isSending}
        agentTyping={agentTyping}
        onRichAction={sendMessage}
      />

      <SuggestionChips suggestions={text.suggestions} onPick={sendMessage} />

      <AnimatePresence>
        {showEscalate && !agentConnected && (
          <motion.button
            className="cc-escalate"
            onClick={onEscalate}
            disabled={handoffPending}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            {handoffPending ? text.connecting : text.escalateButton}
          </motion.button>
        )}
      </AnimatePresence>

      <InputBox
        value={input}
        loading={isSending}
        disabled={!sessionId}
        onChange={setInput}
        onSend={sendMessage}
        onTyping={onTyping}
        onEscalate={onEscalate}
        handoffPending={handoffPending}
        placeholder={text.placeholder}
      />
    </motion.section>
  );
}
