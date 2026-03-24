import { StatusLog } from "../models/StatusLog.js";
import { ragService } from "./rag/ragService.js";

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

export async function checkAndRecordStatus() {
  let apiStatus = "down";
  let apiResponseTime = null;
  let llmStatus = "down";
  let llmResponseTime = null;

  const apiStartTime = Date.now();
  try {
    apiStatus = "up";
    apiResponseTime = Date.now() - apiStartTime;
  } catch {
    apiStatus = "down";
  }

  const llmStartTime = Date.now();
  try {
    await ragService.init();
    const llmResponse = await ragService.ask("health check");
    if (llmResponse && llmResponse.answer) {
      llmStatus = "up";
      llmResponseTime = Date.now() - llmStartTime;
    }
  } catch {
    llmStatus = "down";
  }

  await recordStatus(apiStatus, llmStatus, apiResponseTime, llmResponseTime);
  return { apiStatus, llmStatus, apiResponseTime, llmResponseTime };
}
