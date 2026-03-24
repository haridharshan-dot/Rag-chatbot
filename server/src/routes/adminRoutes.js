import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { requireAgentAuth } from "../middleware/agentAuth.js";
import { getDatabaseHealth } from "../config/db.js";
import { env } from "../config/env.js";
import { ragService } from "../services/rag/ragService.js";
import { getRuntimeSettings, updateRuntimeSettings } from "../services/adminSettingsService.js";
import { checkAndRecordStatus } from "../services/statusService.js";
import { ChatSession } from "../models/ChatSession.js";

const router = Router();

router.use(requireAgentAuth);

async function loadKnowledgeStats() {
  let chunkCount = 0;
  let updatedAt = null;

  try {
    const content = await fs.readFile(env.chunksStorePath, "utf8");
    const parsed = JSON.parse(content);
    chunkCount = Array.isArray(parsed.chunks) ? parsed.chunks.length : 0;
    updatedAt = parsed.updatedAt || null;
  } catch {
    // Ignore missing chunk store; admin UI will show fallback values.
  }

  let sourceFileCount = 0;
  try {
    const entries = await fs.readdir(env.dataDir, { withFileTypes: true });
    sourceFileCount = entries.filter((entry) => entry.isFile()).length;
  } catch {
    // Ignore missing data dir.
  }

  return {
    dataDir: path.resolve(env.dataDir),
    sourceFileCount,
    chunkCount,
    lastIngestedAt: updatedAt,
  };
}

router.get("/overview", async (req, res, next) => {
  try {
    const [settings, knowledge] = await Promise.all([
      getRuntimeSettings(),
      loadKnowledgeStats(),
    ]);

    const db = getDatabaseHealth();
    const rag = ragService.getStatus();

    return res.json({
      success: true,
      data: {
        readiness: {
          status: db.ok ? "ready" : "degraded",
          apiStatus: db.ok ? "up" : "down",
          llmStatus: rag.llmProvider === "retrieval-only" ? "down" : "up",
          db,
          rag,
          timestamp: new Date().toISOString(),
        },
        settings,
        knowledge,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/settings", async (req, res, next) => {
  try {
    const settings = await getRuntimeSettings();
    return res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

router.put("/settings", async (req, res, next) => {
  try {
    const settings = await updateRuntimeSettings(req.body || {});
    return res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

router.post("/actions/reindex", async (req, res, next) => {
  try {
    const summary = await ragService.reindex();
    return res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

router.post("/actions/record-status", async (req, res, next) => {
  try {
    const status = await checkAndRecordStatus();
    return res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

router.get("/sessions", async (req, res, next) => {
  try {
    const status = String(req.query?.status || "queued").trim();
    const limit = Math.min(Number(req.query?.limit || 50), 200);
    const allowedStatus = new Set(["queued", "active", "resolved", "bot"]);
    const criteria = allowedStatus.has(status) ? { status } : {};

    const sessions = await ChatSession.find(criteria)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

router.post("/sessions/:sessionId/force-assign", async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const agentId = String(req.body?.agentId || req.agent?.agentId || "").trim();
    if (!agentId) {
      return res.status(400).json({ success: false, message: "agentId is required" });
    }

    session.status = "active";
    session.assignedAgentId = agentId;
    if (!session.escalationRequestedAt) {
      session.escalationRequestedAt = new Date();
    }
    session.messages.push({
      sender: "system",
      content: `Session force-assigned to ${agentId} by admin ${req.agent?.agentId || "admin"}.`,
      meta: { agentId },
    });
    await session.save();

    req.app.locals.io.to(`session:${session.id}`).emit("agent:joined", {
      sessionId: session.id,
      agentId,
      forced: true,
    });
    req.app.locals.io.emit("queue:updated");

    return res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

router.post("/sessions/:sessionId/reopen", async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    session.status = "queued";
    session.resolvedAt = null;
    session.escalationRequestedAt = new Date();
    session.messages.push({
      sender: "system",
      content: `Session reopened by admin ${req.agent?.agentId || "admin"}.`,
    });
    await session.save();

    req.app.locals.io.emit("queue:updated");
    req.app.locals.io.to("agents").emit("agent:sessionQueued", {
      sessionId: session.id,
      studentId: session.studentId,
      reopened: true,
    });

    return res.json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

router.get("/sessions/:sessionId/transcript", async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.sessionId).lean();
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const format = String(req.query?.format || "txt").toLowerCase();
    const safeId = String(session._id || session.id || "session");

    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="transcript-${safeId}.json"`);
      return res.send(JSON.stringify(session, null, 2));
    }

    const lines = [];
    lines.push(`Session ID: ${safeId}`);
    lines.push(`Student ID: ${session.studentId}`);
    lines.push(`Status: ${session.status}`);
    lines.push(`Created At: ${session.createdAt || "-"}`);
    lines.push("---");
    for (const message of session.messages || []) {
      const at = message.createdAt ? new Date(message.createdAt).toISOString() : "-";
      lines.push(`[${at}] ${String(message.sender || "unknown").toUpperCase()}: ${message.content}`);
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="transcript-${safeId}.txt"`);
    return res.send(lines.join("\n"));
  } catch (error) {
    next(error);
  }
});

router.get("/datasets", async (req, res, next) => {
  try {
    const entries = await fs.readdir(env.dataDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(env.dataDir, entry.name);
      const stat = await fs.stat(fullPath);
      files.push({
        name: entry.name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }

    return res.json({ success: true, data: files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
  } catch (error) {
    next(error);
  }
});

router.post("/datasets/upload", async (req, res, next) => {
  try {
    const fileName = String(req.body?.fileName || "").trim();
    const content = String(req.body?.content || "");

    if (!fileName || !content) {
      return res.status(400).json({ success: false, message: "fileName and content are required" });
    }

    const ext = path.extname(fileName).toLowerCase();
    const allowed = new Set([".json", ".txt", ".md"]);
    if (!allowed.has(ext)) {
      return res.status(400).json({ success: false, message: "Only .json, .txt, .md files are allowed" });
    }

    if (content.length > 2_000_000) {
      return res.status(400).json({ success: false, message: "File too large. Max 2MB." });
    }

    if (ext === ".json") {
      try {
        JSON.parse(content);
      } catch {
        return res.status(400).json({ success: false, message: "Invalid JSON content" });
      }
    }

    await fs.mkdir(env.dataDir, { recursive: true });
    const sanitized = path.basename(fileName).replace(/\s+/g, "_");
    const target = path.join(env.dataDir, sanitized);
    await fs.writeFile(target, content, "utf8");

    return res.json({
      success: true,
      data: {
        fileName: sanitized,
        bytes: Buffer.byteLength(content, "utf8"),
        preview: content.split(/\r?\n/).slice(0, 20).join("\n"),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
