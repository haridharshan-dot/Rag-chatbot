import { ChatSession } from "../models/ChatSession.js";
import { ragService } from "./rag/ragService.js";
import { getRuntimeSettings } from "./adminSettingsService.js";

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
        sender: "system",
        content: "Session started. Ask your question about admissions, courses, cutoffs, scholarships, or deadlines.",
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

  const ragResponse = await ragService.ask(content, { supplementalContext });
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
