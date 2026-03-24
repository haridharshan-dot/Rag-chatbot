import { Router } from "express";
import { ChatSession } from "../models/ChatSession.js";
import { createSession, handleStudentMessage } from "../services/sessionService.js";

const router = Router();

router.post("/session", async (req, res, next) => {
  try {
    const studentId = String(req.body?.studentId || "").trim();
    if (!studentId) {
      return res.status(400).json({ success: false, message: "studentId is required" });
    }

    const session = await createSession(studentId, {
      clientIp: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
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

    if (autoEscalated) {
      const systemMessage = session.messages[session.messages.length - 1];
      req.app.locals.io.to(`session:${session.id}`).emit("chat:message", systemMessage);
      req.app.locals.io.emit("queue:updated");
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

    session.status = "queued";
    session.escalationRequestedAt = new Date();
    session.messages.push({
      sender: "system",
      content: "Student requested live agent support.",
    });

    await session.save();

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

export default router;
