import { StatusLog } from "../models/StatusLog.js";

export async function recordStatus(apiStatus, llmStatus, apiResponseTime = null, llmResponseTime = null) {
  try {
    const log = new StatusLog({
      apiStatus,
      llmStatus,
      apiResponseTime,
      llmResponseTime,
    });
    await log.save();
    console.log("Status log recorded successfully.");
  } catch (error) {
    console.error("Error recording status log:", error);
  }
}

export async function getStatusLogs(days = 7) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - days);

  try {
    const logs = await StatusLog.find({ timestamp: { $gte: sevenDaysAgo } }).sort({ timestamp: 1 });
    return logs;
  } catch (error) {
    console.error("Error fetching status logs:", error);
    return [];
  }
}
