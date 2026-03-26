import { Router } from "express";
import { ChatSession } from "../models/ChatSession.js";
import { createSession, handleStudentMessage } from "../services/sessionService.js";
import { attachOptionalStudentAuth } from "../middleware/studentAuth.js";

const router = Router();
router.use(attachOptionalStudentAuth);
const SESSION_START_MESSAGE = "Session started. Ask your question about admissions, courses, cutoffs, scholarships, or deadlines.";

function sanitizeSiteContext(raw) {
  if (!raw || typeof raw !== "object") return null;

  const title = String(raw.title || "").trim().slice(0, 240);
  const url = String(raw.url || "").trim().slice(0, 1000);
  const description = String(raw.description || "").trim().slice(0, 1200);
  const headings = Array.isArray(raw.headings)
    ? raw.headings.map((item) => String(item || "").trim().slice(0, 180)).filter(Boolean).slice(0, 20)
    : [];
  const text = String(raw.text || "").replace(/\s+/g, " ").trim().slice(0, 7000);
  const capturedAt = raw.capturedAt ? new Date(raw.capturedAt) : null;

  if (!title && !description && !headings.length && !text) return null;

  return {
    title: title || null,
    url: url || null,
    description: description || null,
    headings,
    text: text || null,
    capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
  };
}

router.post("/session", async (req, res, next) => {
  try {
    const tokenStudentId = String(req.student?.studentId || "").trim();
    const bodyStudentId = String(req.body?.studentId || "").trim();
    const studentId = tokenStudentId || bodyStudentId;
    if (!studentId) {
      return res.status(400).json({ success: false, message: "studentId is required" });
    }

    const session = await createSession(studentId, {
      clientIp: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      siteContext: sanitizeSiteContext(req.body?.siteContext),
      studentEmail: req.student?.email || null,
      studentName: req.student?.name || null,
    });
    return res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

router.get("/:sessionId/history", async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId).lean();
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (req.student?.studentId && String(session.studentId) !== String(req.student.studentId)) {
      return res.status(403).json({ success: false, message: "Not allowed for this session" });
    }

    return res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/message", async (req, res, next) => {
  try {
    const content = String(req.body?.content || "").trim();
    if (!content) {
      return res.status(400).json({ success: false, message: "content is required" });
    }
    const currentSession = await ChatSession.findById(req.params.sessionId).select("studentId");
    if (!currentSession) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (
      req.student?.studentId &&
      String(currentSession.studentId) !== String(req.student.studentId)
    ) {
      return res.status(403).json({ success: false, message: "Not allowed for this session" });
    }

    const { session, ragResponse, autoEscalated } = await handleStudentMessage(
      req.params.sessionId,
      content
    );

    req.app.locals.io.to(`session:${session.id}`).emit("chat:message", {
      sender: "student",
      content,
    });

    const botMessage = autoEscalated
      ? session.messages[session.messages.length - 2]
      : session.messages[session.messages.length - 1];
    req.app.locals.io.to(`session:${session.id}`).emit("chat:message", botMessage);
    // Keep agent dashboard queue/live feed fresh for all student activity.
    req.app.locals.io.emit("queue:updated");
    req.app.locals.io.to("agents").emit("agent:sessionActivity", {
      sessionId: session.id,
      studentId: session.studentId,
      status: session.status,
      lastMessageAt: new Date().toISOString(),
    });

    if (autoEscalated) {
      const systemMessage = session.messages[session.messages.length - 1];
      req.app.locals.io.to(`session:${session.id}`).emit("chat:message", systemMessage);
      req.app.locals.io.to("agents").emit("agent:sessionQueued", {
        sessionId: session.id,
        studentId: session.studentId,
        autoEscalated: true,
      });
    }

    return res.json({
      success: true,
      data: {
        sessionId: session.id,
        sessionStatus: session.status,
        botMessage,
        confidence: ragResponse.confidence,
        escalationSuggested: ragResponse.escalationSuggested,
        outOfScope: ragResponse.outOfScope,
        autoEscalated,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/escalate", async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (req.student?.studentId && String(session.studentId) !== String(req.student.studentId)) {
      return res.status(403).json({ success: false, message: "Not allowed for this session" });
    }

    session.status = "queued";
    session.escalationRequestedAt = new Date();
    session.messages.push({
      sender: "system",
      content: "Student requested live agent support.",
    });

    await session.save();
    req.app.locals.io.to(`session:${session.id}`).emit("chat:message", session.messages[session.messages.length - 1]);

    req.app.locals.io.emit("queue:updated");
    req.app.locals.io.to("agents").emit("agent:sessionQueued", {
      sessionId: session.id,
      studentId: session.studentId,
    });

    return res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/clear", async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (req.student?.studentId && String(session.studentId) !== String(req.student.studentId)) {
      return res.status(403).json({ success: false, message: "Not allowed for this session" });
    }

    session.status = "bot";
    session.assignedAgentId = null;
    session.escalationRequestedAt = null;
    session.resolvedAt = null;
    session.messages = [
      {
        sender: "system",
        content: SESSION_START_MESSAGE,
      },
    ];

    await session.save();
    req.app.locals.io.to(`session:${session.id}`).emit("chat:cleared", {
      sessionId: session.id,
    });

    return res.json({
      success: true,
      data: {
        sessionId: session.id,
        sessionStatus: session.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
