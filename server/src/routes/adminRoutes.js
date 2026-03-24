import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { requireAgentAuth } from "../middleware/agentAuth.js";
import { getDatabaseHealth } from "../config/db.js";
import { env } from "../config/env.js";
import { ragService } from "../services/rag/ragService.js";
import { getRuntimeSettings, updateRuntimeSettings } from "../services/adminSettingsService.js";
import { checkAndRecordStatus } from "../services/statusService.js";

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

export default router;
