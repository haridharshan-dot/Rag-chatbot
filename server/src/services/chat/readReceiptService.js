import { ChatSession } from "../../models/ChatSession.js";

function toDate(value) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function markStudentMessagesSeenByAgent(sessionId, agentId, seenAtInput = null) {
  const normalizedSessionId = String(sessionId || "").trim();
  const normalizedAgentId = String(agentId || "").trim();
  if (!normalizedSessionId || !normalizedAgentId) {
    return { updated: false, seenAt: null, sessionId: normalizedSessionId };
  }

  const session = await ChatSession.findById(normalizedSessionId);
  if (!session) {
    return { updated: false, seenAt: null, sessionId: normalizedSessionId };
  }

  const seenAt = toDate(seenAtInput);
  let changed = false;

  for (const message of session.messages || []) {
    if (String(message?.sender || "") !== "student") continue;
    const currentSeenAt = message?.meta?.seenByAgentAt ? new Date(message.meta.seenByAgentAt) : null;
    if (currentSeenAt && currentSeenAt.getTime() >= seenAt.getTime()) continue;

    message.meta = {
      ...(message.meta || {}),
      seenByAgentAt: seenAt,
      seenByAgentId: normalizedAgentId,
    };
    changed = true;
  }

  if (!changed) {
    return { updated: false, seenAt: seenAt.toISOString(), sessionId: normalizedSessionId };
  }

  await session.save();
  return { updated: true, seenAt: seenAt.toISOString(), sessionId: normalizedSessionId };
}
