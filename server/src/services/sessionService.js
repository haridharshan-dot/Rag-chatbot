import { ChatSession } from "../models/ChatSession.js";
import { ragService } from "./rag/ragService.js";

export async function createSession(studentId) {
  const session = await ChatSession.create({
    studentId,
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

  session.messages.push({
    sender: "bot",
    content: ragResponse.answer,
    meta: {
      confidence: ragResponse.confidence,
      sources: ragResponse.sources,
      escalationSuggested: ragResponse.escalationSuggested,
    },
  });

  await session.save();

  return {
    session,
    ragResponse,
  };
}
