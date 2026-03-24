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
  const db = getDatabaseHealth();
  const rag = ragService.getStatus();
  const ok = db.ok;

  return res.status(ok ? 200 : 503).json({
    success: ok,
    data: {
      status: ok ? "ready" : "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      db,
      rag,
    },
  });
});

export default router;
