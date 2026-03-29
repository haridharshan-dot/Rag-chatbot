import { ChatSession } from "../models/ChatSession.js";
import { ragService } from "./rag/ragService.js";
import { getRuntimeSettings } from "./adminSettingsService.js";
import { buildFallbackSuggestions, runConversationFlow } from "./assistant/conversationFlowService.js";

const DEFAULT_SESSION_START_MESSAGE =
  "Session started. Ask your question about admissions, courses, cutoffs, scholarships, or deadlines.";

function toDisplayName(name) {
  const value = String(name || "").trim().replace(/\s+/g, " ");
  if (!value) return "";
  return value.split(" ")[0];
}

function buildSessionStartMessage(studentName = "") {
  const displayName = toDisplayName(studentName);
  if (!displayName) return DEFAULT_SESSION_START_MESSAGE;
  return `Hi ${displayName}, welcome to Sona College AI assistant. Ask your question about admissions, courses, cutoffs, scholarships, or deadlines.`;
}

export async function createSession(
  studentId,
  { clientIp = null, userAgent = null, siteContext = null, studentEmail = null, studentName = null } = {}
) {
  const existing = await ChatSession.findOne({
    studentId,
    status: { $in: ["bot", "queued"] },
  }).sort({ updatedAt: -1 });

  if (existing) {
    if (studentEmail && !existing.studentEmail) existing.studentEmail = studentEmail;
    if (studentName && !existing.studentName) existing.studentName = studentName;
    if (siteContext) existing.siteContext = siteContext;
    if (Array.isArray(existing.messages) && existing.messages.length === 1) {
      const firstMessage = existing.messages[0];
      const currentContent = String(firstMessage?.content || "").trim();
      if (currentContent === DEFAULT_SESSION_START_MESSAGE || currentContent.startsWith("Hi ")) {
        firstMessage.sender = "bot";
        firstMessage.content = buildSessionStartMessage(existing.studentName || studentName);
      }
    }
    await existing.save();
    return existing;
  }

  const session = await ChatSession.create({
    studentId,
    studentEmail,
    studentName,
    clientIp,
    userAgent,
    siteContext,
    messages: [
      {
        sender: "bot",
        content: buildSessionStartMessage(studentName),
      },
    ],
  });

  return session;
}

export async function handleStudentMessage(sessionId, content) {
  const session = await ChatSession.findById(sessionId);
  if (!session) {
    const error = new Error("Session not found");
    error.status = 404;
    throw error;
  }

  // Block bot responses if agent active
  if (session.status === "active" || session.assignedAgentId) {
    session.messages.push({
      sender: "student",
      content,
      meta: {
        intent: "live_agent",
      },
    });
    await session.save();
    return {
      session,
      ragResponse: {
        answer: "",
        confidence: 1,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
        suggestions: [],
        cards: [],
        blockedByAgent: true,
      },
      autoEscalated: false,
    };
  }

  const flowResult = runConversationFlow(session, content);
  session.messages.push({
    sender: "student",
    content,
    meta: {
      intent: flowResult.intent || "general",
    },
  });

  if (flowResult.handled) {
    const botMeta = {
      confidence: flowResult.confidence ?? 1,
      sources: [],
      escalationSuggested: false,
      outOfScope: false,
      intent: flowResult.intent || "guided",
      suggestions: flowResult.suggestions || [],
      cards: flowResult.cards || [],
      guidedFlow: true,
    };

    session.messages.push({
      sender: "bot",
      content: flowResult.answer,
      meta: botMeta,
    });
    await session.save();
    return {
      session,
      ragResponse: {
        answer: flowResult.answer,
        confidence: botMeta.confidence,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
        suggestions: botMeta.suggestions,
        cards: botMeta.cards,
      },
      autoEscalated: false,
    };
  }

  const supplementalContext = session.siteContext
    ? [
        session.siteContext.title ? `Website Title: ${session.siteContext.title}` : "",
        session.siteContext.url ? `Website URL: ${session.siteContext.url}` : "",
        session.siteContext.description
          ? `Website Description: ${session.siteContext.description}`
          : "",
        (session.siteContext.headings || []).length
          ? `Website Headings: ${(session.siteContext.headings || []).join(" | ")}`
          : "",
        session.siteContext.text ? `Website Content: ${session.siteContext.text}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  let ragResponse;
  try {
    ragResponse = await ragService.ask(content, { 
      supplementalContext,
      previousMessages: session.messages.slice(-10), // Last 10 for memory
      sessionId: session._id
    });
  } catch (error) {
    console.error("RAG message handling failed:", error?.message || error);
    ragResponse = {
      answer:
        "I'm unable to retrieve knowledge right now. Please try again in a moment or connect to a live agent.",
      confidence: 0,
      sources: [],
      escalationSuggested: true,
      outOfScope: true,
    };
  }
  const settings = await getRuntimeSettings();
  const suggestions =
    Array.isArray(ragResponse?.suggestions) && ragResponse.suggestions.length
      ? ragResponse.suggestions
      : buildFallbackSuggestions(flowResult.intent);
  const shouldAutoEscalate = Boolean(
    settings.autoEscalationEnabled && (ragResponse.outOfScope || ragResponse.needsAgent) && session.status === "bot"
  );

  session.messages.push({
    sender: "bot",
    content: ragResponse.answer,
    meta: {
      confidence: ragResponse.confidence,
      sources: ragResponse.sources,
      escalationSuggested: ragResponse.escalationSuggested || false,
      outOfScope: ragResponse.outOfScope || false,
      needsAgent: ragResponse.needsAgent || false,
      suggestions,
      cards: Array.isArray(ragResponse.cards) ? ragResponse.cards : [],
      intent: flowResult.intent || "general",
    },
  });

  if (shouldAutoEscalate) {
    session.status = "queued";
    session.escalationRequestedAt = new Date();
    session.messages.push({
      sender: "system",
      content: "Your question is outside the available dataset. A live agent has been notified automatically.",
      meta: {
        escalationSuggested: true,
      },
    });
  }

  await session.save();

  return {
    session,
      ragResponse,
      autoEscalated: shouldAutoEscalate,
  };
}
