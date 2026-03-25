import { Router } from "express";
import { getDatabaseHealth } from "../config/db.js";
import { ragService } from "../services/rag/ragService.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

router.get("/ready", async (req, res) => {
  try {
    await ragService.init();
  } catch {
    // Readiness should still return useful degraded details even if RAG warm-up fails.
  }

  const db = getDatabaseHealth();
  const rag = ragService.getStatus();
  const ok = db.ok;
  const llmConfigured = rag.llmProvider !== "retrieval-only";

  return res.status(ok ? 200 : 503).json({
    success: ok,
    data: {
      status: ok ? "ready" : "degraded",
      apiStatus: ok ? "up" : "down",
      llmStatus: llmConfigured ? "up" : "down",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      db,
      rag,
    },
  });
});

export default router;
