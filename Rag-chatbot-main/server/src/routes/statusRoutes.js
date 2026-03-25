import { Router } from "express";
import { getStatusLogs } from "../services/statusService.js";
import { env } from "../config/env.js";

const router = Router();

// Simple in-memory cache for status logs (5 minute TTL for free tier)
let cachedStatusLogs = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.get("/status-logs", async (req, res, next) => {
  try {
    const now = Date.now();
    
    // Check cache if enabled
    if (env.cacheStatusLogs && cachedStatusLogs && (now - cacheTimestamp) < CACHE_TTL) {
      return res.json({ success: true, data: cachedStatusLogs, cached: true });
    }
    
    const logs = await getStatusLogs(7); // Get logs for the last 7 days
    
    // Update cache
    if (env.cacheStatusLogs) {
      cachedStatusLogs = logs;
      cacheTimestamp = now;
    }
    
    return res.json({ success: true, data: logs, cached: false });
  } catch (error) {
    next(error);
  }
});

export default router;
