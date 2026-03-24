import { ChatSession } from "../models/ChatSession.js";
import { ragService } from "./rag/ragService.js";
import { getRuntimeSettings } from "./adminSettingsService.js";

export async function createSession(studentId, { clientIp = null, userAgent = null } = {}) {
  const session = await ChatSession.create({
    studentId,
    clientIp,
    userAgent,
    messages: [
      {
        sender: "system",
        content: "Session started. Ask your question about admissions, courses, fees, or cutoffs.",
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

  session.messages.push({ sender: "student", content });

  const ragResponse = await ragService.ask(content);
  const settings = await getRuntimeSettings();
  const shouldAutoEscalate = Boolean(
    settings.autoEscalationEnabled && ragResponse.outOfScope && session.status === "bot"
  );

  session.messages.push({
    sender: "bot",
    content: ragResponse.answer,
    meta: {
      confidence: ragResponse.confidence,
      sources: ragResponse.sources,
      escalationSuggested: ragResponse.escalationSuggested,
      outOfScope: ragResponse.outOfScope,
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
