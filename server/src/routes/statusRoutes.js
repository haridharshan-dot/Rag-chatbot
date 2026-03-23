import { Router } from "express";
import { getStatusLogs } from "../services/statusService.js";

const router = Router();

router.get("/status-logs", async (req, res, next) => {
  try {
    const logs = await getStatusLogs(7); // Get logs for the last 7 days
    return res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

export default router;
