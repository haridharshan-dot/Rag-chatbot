import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { requireAdminAuth, signAgentToken } from "../middleware/agentAuth.js";
import { getDatabaseHealth } from "../config/db.js";
import { env } from "../config/env.js";
import { ragService } from "../services/rag/ragService.js";
import { getRuntimeSettings, updateRuntimeSettings } from "../services/adminSettingsService.js";
import { checkAndRecordStatus } from "../services/statusService.js";
import { ChatSession } from "../models/ChatSession.js";
import { AgentActivity } from "../models/AgentActivity.js";
import { StudentUser } from "../models/StudentUser.js";
import { checkOtpProviderHealth } from "../services/otpDeliveryService.js";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCandidateDataDirs() {
  return [
    env.dataDir,
    path.resolve(process.cwd(), "data/sample"),
    path.resolve(process.cwd(), "server/data/sample"),
    path.resolve(__dirname, "../../../data/sample"),
    path.resolve(__dirname, "../../data/sample"),
  ].filter(Boolean);
}

async function resolveActiveDataDir() {
  const uniqueDirs = [...new Set(getCandidateDataDirs().map((dir) => path.resolve(dir)))];
  let firstAccessibleDir = null;

  for (const dataDir of uniqueDirs) {
    try {
      const entries = await fs.readdir(dataDir, { withFileTypes: true });
      if (!firstAccessibleDir) {
        firstAccessibleDir = dataDir;
      }
      if (entries.some((entry) => entry.isFile())) {
        return dataDir;
      }
    } catch {
      // Try next candidate directory.
    }
  }

  return firstAccessibleDir || path.resolve(env.dataDir);
}

router.post("/login", (req, res) => {
  const identity = String(req.body?.email || req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "").trim();

  if (!identity || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  const validIdentity = identity === env.adminEmail || identity === String(env.adminUsername || "").toLowerCase();

  if (!validIdentity || password !== env.adminPassword) {
    return res.status(401).json({ success: false, message: "Invalid admin credentials" });
  }

  const adminId = String(env.adminUsername || "admin").toLowerCase();
  const token = signAgentToken({
    role: "admin",
    agentId: adminId,
    email: env.adminEmail,
  });

  return res.json({
    success: true,
    data: {
      token,
      agentId: adminId,
      email: env.adminEmail,
      role: "admin",
      expiresIn: env.agentJwtExpiry,
    },
  });
});

router.use(requireAdminAuth);

function getRangeStart(range) {
  const now = Date.now();
  const value = String(range || "week").toLowerCase();
  const dayMs = 24 * 60 * 60 * 1000;
  if (value === "day") return new Date(now - dayMs);
  if (value === "month") return new Date(now - 30 * dayMs);
  return new Date(now - 7 * dayMs);
}

async function readDatasetPreview(fileName, includeFull = false) {
  const requested = String(fileName || "").trim();
  if (!requested) {
    const error = new Error("fileName is required");
    error.status = 400;
    throw error;
  }

  const safeName = path.basename(requested);
  const resolvedDataDir = await resolveActiveDataDir();
  const filePath = path.join(resolvedDataDir, safeName);
  const resolvedFilePath = path.resolve(filePath);
  if (!resolvedFilePath.startsWith(resolvedDataDir)) {
    const error = new Error("Invalid file path");
    error.status = 400;
    throw error;
  }

  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    const error = new Error("Dataset file not found");
    error.status = 404;
    throw error;
  }

  const content = await fs.readFile(filePath, "utf8");
  return {
    name: safeName,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    preview: includeFull ? content : content.slice(0, 12000),
    truncated: !includeFull && content.length > 12000,
    content,
  };
}

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

  const resolvedDataDir = await resolveActiveDataDir();
  let sourceFileCount = 0;
  try {
    const entries = await fs.readdir(resolvedDataDir, { withFileTypes: true });
    sourceFileCount = entries.filter((entry) => entry.isFile()).length;
  } catch {
    // Ignore missing data dir.
  }

  return {
    dataDir: resolvedDataDir,
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

    try {
      await ragService.init();
    } catch {
      // Keep overview responsive even when model/vector initialization fails.
    }

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
        siteConfig: {
          backend: {
            microsoftAuthEnvEnabled: Boolean(env.microsoftAuthEnabled),
            microsoftAllowedDomainsConfigured: Boolean(env.microsoftAllowedDomains?.length),
            microsoftAllowedEmailsConfigured: Boolean(env.microsoftAllowedEmails?.length),
          },
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

router.post("/actions/warm-rag", async (req, res, next) => {
  try {
    await ragService.init();
    return res.json({ success: true, data: ragService.getStatus() });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: error?.message || "Failed to initialize RAG service",
      data: ragService.getStatus(),
    });
  }
});

router.post("/actions/check-otp-providers", async (req, res, next) => {
  try {
    const health = await checkOtpProviderHealth();
    return res.json({ success: true, data: health });
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

router.get("/reports", async (req, res, next) => {
  try {
    const range = String(req.query?.range || "week").toLowerCase();
    const startDate = getRangeStart(range);

    const sessions = await ChatSession.find({ updatedAt: { $gte: startDate } })
      .sort({ updatedAt: -1 })
      .limit(1200)
      .lean();

    const statusCounts = sessions.reduce(
      (acc, session) => {
        const status = String(session.status || "bot");
        if (status === "queued") acc.queued += 1;
        else if (status === "active") acc.active += 1;
        else if (status === "resolved") acc.resolved += 1;
        else acc.bot += 1;
        if (session.escalationRequestedAt) acc.escalated += 1;
        return acc;
      },
      { queued: 0, active: 0, resolved: 0, bot: 0, escalated: 0 }
    );

    const resolutionMinutes = sessions
      .map((session) => {
        if (!session.escalationRequestedAt || !session.resolvedAt) return null;
        const delta = new Date(session.resolvedAt).getTime() - new Date(session.escalationRequestedAt).getTime();
        if (!Number.isFinite(delta) || delta < 0) return null;
        return Math.round(delta / 60000);
      })
      .filter((value) => Number.isFinite(value));

    const avgResolutionMinutes = resolutionMinutes.length
      ? Math.round(resolutionMinutes.reduce((sum, value) => sum + value, 0) / resolutionMinutes.length)
      : 0;

    const items = sessions.map((session) => ({
      sessionId: String(session._id || session.id || ""),
      studentId: session.studentId || "-",
      status: session.status || "bot",
      agentId: session.assignedAgentId || "-",
      updatedAt: session.updatedAt || session.createdAt || null,
      escalationRequestedAt: session.escalationRequestedAt || null,
      resolvedAt: session.resolvedAt || null,
      messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    }));

    return res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        range,
        startDate: startDate.toISOString(),
        summary: {
          totalSessions: sessions.length,
          queuedSessions: statusCounts.queued,
          activeSessions: statusCounts.active,
          resolvedSessions: statusCounts.resolved,
          botSessions: statusCounts.bot,
          escalatedSessions: statusCounts.escalated,
          avgResolutionMinutes,
        },
        items,
      },
    });
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
    const activeDataDir = await resolveActiveDataDir();
    await fs.mkdir(activeDataDir, { recursive: true });
    const entries = await fs.readdir(activeDataDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(activeDataDir, entry.name);
      const stat = await fs.stat(fullPath);
      files.push({
        name: entry.name,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }

    return res.json({ success: true, data: files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EACCES" || error?.code === "EPERM") {
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
});

router.get("/datasets/:fileName/preview", async (req, res, next) => {
  try {
    const includeFull = String(req.query?.full || "").toLowerCase() === "true";
    const data = await readDatasetPreview(req.params?.fileName, includeFull);

    return res.json({
      success: true,
      data: {
        name: data.name,
        size: data.size,
        updatedAt: data.updatedAt,
        preview: data.preview,
        truncated: data.truncated,
      },
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    if (error?.code === "ENOENT") {
      return res.status(404).json({ success: false, message: "Dataset file not found" });
    }
    next(error);
  }
});

router.get("/datasets/preview", async (req, res, next) => {
  try {
    const includeFull = String(req.query?.full || "").toLowerCase() === "true";
    const data = await readDatasetPreview(req.query?.fileName, includeFull);
    return res.json({
      success: true,
      data: {
        name: data.name,
        size: data.size,
        updatedAt: data.updatedAt,
        preview: data.preview,
        truncated: data.truncated,
      },
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    if (error?.code === "ENOENT") {
      return res.status(404).json({ success: false, message: "Dataset file not found" });
    }
    next(error);
  }
});

router.get("/datasets/:fileName/download", async (req, res, next) => {
  try {
    const data = await readDatasetPreview(req.params?.fileName, true);
    const safeName = data.name;
    const content = data.content;
    const ext = path.extname(safeName).toLowerCase();
    const contentType = ext === ".json"
      ? "application/json; charset=utf-8"
      : "text/plain; charset=utf-8";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    return res.send(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ success: false, message: "Dataset file not found" });
    }
    next(error);
  }
});

router.get("/agents", async (req, res, next) => {
  try {
    const [activities, activeSessions, resolvedSessions] = await Promise.all([
      AgentActivity.find({}).sort({ updatedAt: -1 }).lean(),
      ChatSession.aggregate([
        { $match: { status: "active", assignedAgentId: { $ne: null } } },
        { $group: { _id: "$assignedAgentId", activeCount: { $sum: 1 } } },
      ]),
      ChatSession.aggregate([
        { $match: { status: "resolved", assignedAgentId: { $ne: null } } },
        { $group: { _id: "$assignedAgentId", resolvedCount: { $sum: 1 } } },
      ]),
    ]);

    const activeMap = new Map(activeSessions.map((row) => [String(row._id), row.activeCount]));
    const resolvedMap = new Map(resolvedSessions.map((row) => [String(row._id), row.resolvedCount]));

    let data = activities.map((activity) => ({
      agentId: activity.agentId,
      email: activity.email,
      displayName: activity.displayName,
      provider: activity.provider,
      lastLoginAt: activity.lastLoginAt,
      lastLoginIp: activity.lastLoginIp,
      activeSessions: activeMap.get(activity.agentId) || 0,
      resolvedSessions: resolvedMap.get(activity.agentId) || 0,
    }));

    const search = String(req.query?.search || "").trim().toLowerCase();
    if (search) {
      data = data.filter((row) => {
        const haystack = [row.agentId, row.displayName, row.email, row.provider]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(search);
      });
    }

    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 20)));
    const total = data.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = data.slice(start, start + limit);

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          search,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const sessions = await ChatSession.find({})
      .select("studentId status updatedAt createdAt clientIp assignedAgentId")
      .sort({ updatedAt: -1 })
      .lean();

    const sessionMap = new Map();
    for (const session of sessions) {
      const key = String(session.studentId || "").trim();
      if (!key) continue;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          sessions: 0,
          lastSeenAt: session.updatedAt || session.createdAt || null,
          currentStatus: session.status || "bot",
          lastIp: session.clientIp || null,
          assignedAgentId: session.assignedAgentId || null,
        });
      }
      const row = sessionMap.get(key);
      row.sessions += 1;
      const updatedAt = session.updatedAt || session.createdAt || null;
      if (updatedAt && (!row.lastSeenAt || new Date(updatedAt) > new Date(row.lastSeenAt))) {
        row.lastSeenAt = updatedAt;
        row.currentStatus = session.status || row.currentStatus;
        row.assignedAgentId = session.assignedAgentId || row.assignedAgentId;
      }
      if (!row.lastIp && session.clientIp) {
        row.lastIp = session.clientIp;
      }
    }

    const users = await StudentUser.find({})
      .select("_id name email mobile createdAt updatedAt lastLoginAt")
      .sort({ updatedAt: -1 })
      .lean();

    let data = users.map((user) => {
      const studentId = String(user._id);
      const sessionData = sessionMap.get(studentId) || null;
      return {
        studentId,
        name: user.name || "-",
        email: user.email || "-",
        mobile: user.mobile || "-",
        sessions: sessionData?.sessions || 0,
        lastSeenAt: sessionData?.lastSeenAt || user.lastLoginAt || user.updatedAt || user.createdAt || null,
        currentStatus: sessionData?.currentStatus || "no-session",
        lastIp: sessionData?.lastIp || null,
        assignedAgentId: sessionData?.assignedAgentId || null,
      };
    });

    const search = String(req.query?.search || "").trim().toLowerCase();
    if (search) {
      data = data.filter((row) => {
        const haystack = [row.studentId, row.name, row.email, row.mobile, row.currentStatus, row.assignedAgentId, row.lastIp]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(search);
      });
    }

    const page = Math.max(1, Number(req.query?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 20)));
    const total = data.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = data.slice(start, start + limit);

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          search,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:userId", async (req, res, next) => {
  try {
    const userId = String(req.params?.userId || "").trim();
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const user = await StudentUser.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await Promise.all([
      ChatSession.deleteMany({ studentId: userId }),
      StudentUser.deleteOne({ _id: userId }),
    ]);

    return res.json({
      success: true,
      data: {
        removedUserId: userId,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/datasets/:fileName", async (req, res, next) => {
  try {
    const requested = String(req.params?.fileName || "").trim();
    if (!requested) {
      return res.status(400).json({ success: false, message: "fileName is required" });
    }

    const safeName = path.basename(requested);
    const resolvedDataDir = await resolveActiveDataDir();
    const target = path.join(resolvedDataDir, safeName);
    const resolvedTarget = path.resolve(target);
    if (!resolvedTarget.startsWith(resolvedDataDir)) {
      return res.status(400).json({ success: false, message: "Invalid file path" });
    }

    await fs.unlink(target);

    let reindex = null;
    let reindexError = null;
    try {
      reindex = await ragService.reindex();
    } catch (error) {
      reindexError = error?.message || "Re-index failed after delete";
    }

    return res.json({
      success: true,
      data: {
        removed: safeName,
        reindex,
        reindexError,
      },
    });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ success: false, message: "Dataset file not found" });
    }
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

    const resolvedDataDir = await resolveActiveDataDir();
    await fs.mkdir(resolvedDataDir, { recursive: true });
    const sanitized = path.basename(fileName).replace(/\s+/g, "_");
    const target = path.join(resolvedDataDir, sanitized);
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
