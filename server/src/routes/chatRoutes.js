import { Router } from "express";
import { ChatSession } from "../models/ChatSession.js";
import { createSession, handleStudentMessage } from "../services/sessionService.js";
import { attachOptionalStudentAuth } from "../middleware/studentAuth.js";

const router = Router();
router.use(attachOptionalStudentAuth);
const SESSION_START_MESSAGE = "Session started. Ask your question about admissions, courses, cutoffs, scholarships, or deadlines.";
const OFFICIAL_WEBSITE_URL = "https://www.sonatech.ac.in/";

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
      sessionId: session.id,
      sender: "student",
      content,
      createdAt: new Date().toISOString(),
    });

    const botMessage = autoEscalated
      ? session.messages[session.messages.length - 2]
      : session.messages[session.messages.length - 1];
    req.app.locals.io.to(`session:${session.id}`).emit("chat:message", {
      ...(botMessage?.toObject ? botMessage.toObject() : botMessage),
      sessionId: session.id,
    });
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
      req.app.locals.io.to(`session:${session.id}`).emit("chat:message", {
        ...(systemMessage?.toObject ? systemMessage.toObject() : systemMessage),
        sessionId: session.id,
      });
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
        suggestions: Array.isArray(ragResponse.suggestions) ? ragResponse.suggestions : [],
        cards: Array.isArray(ragResponse.cards) ? ragResponse.cards : [],
        autoEscalated,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:sessionId/notifications", async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId).select("studentId");
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (req.student?.studentId && String(session.studentId) !== String(req.student.studentId)) {
      return res.status(403).json({ success: false, message: "Not allowed for this session" });
    }

    return res.json({
      success: true,
      data: {
        alerts: [
          { type: "deadline", title: "Application timeline", detail: "Track the latest application dates daily." },
          { type: "counselling", title: "Counselling updates", detail: "Check counselling windows and slot updates." },
          { type: "document", title: "Document readiness", detail: "Keep marksheet, ID proof, and certificates ready." },
        ],
        officialWebsite: OFFICIAL_WEBSITE_URL,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:sessionId/document/analyze", async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (req.student?.studentId && String(session.studentId) !== String(req.student.studentId)) {
      return res.status(403).json({ success: false, message: "Not allowed for this session" });
    }

    const extractedText = String(req.body?.extractedText || "").trim();
    const fileName = String(req.body?.fileName || "uploaded-document").trim();
    const markMatch = extractedText.match(/\b(1[0-9]{2}|200|[0-9]{2})(?:\.\d+)?\b/);
    const detectedCutoff = markMatch ? Number(markMatch[0]) : null;
    if (Number.isFinite(detectedCutoff)) {
      session.studentProfile = {
        ...(session.studentProfile || {}),
        cutoffMarks: detectedCutoff,
      };
    }

    session.messages.push({
      sender: "system",
      content: `Document analyzed from ${fileName}.`,
      meta: {
        intent: "document_analysis",
      },
    });
    session.messages.push({
      sender: "bot",
      content: Number.isFinite(detectedCutoff)
        ? `I extracted an approximate cutoff/marks value: ${detectedCutoff}. You can now ask for personalized recommendation.`
        : "I could not detect marks clearly from the uploaded document. Please type your cutoff manually or connect to a live agent.",
      meta: {
        intent: "document_analysis",
        confidence: Number.isFinite(detectedCutoff) ? 0.9 : 0.4,
        suggestions: Number.isFinite(detectedCutoff)
          ? ["Recommend best courses", "Check eligibility", "Talk to agent"]
          : ["My cutoff is 175", "Check eligibility", "Talk to agent"],
      },
    });

    await session.save();
    req.app.locals.io.emit("queue:updated");

    return res.json({
      success: true,
      data: {
        sessionId: session.id,
        detectedCutoff: Number.isFinite(detectedCutoff) ? detectedCutoff : null,
        next: Number.isFinite(detectedCutoff)
          ? "Ask: Recommend best courses"
          : "Share cutoff manually",
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
    const latest = session.messages[session.messages.length - 1];
    req.app.locals.io.to(`session:${session.id}`).emit("chat:message", {
      ...(latest?.toObject ? latest.toObject() : latest),
      sessionId: session.id,
    });

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
