import { recordStatus } from "../services/statusService.js";
import { ragService } from "../services/rag/ragService.js";
import { connectDatabase } from "../config/db.js";
import { env } from "../config/env.js";

async function checkAndRecordStatus() {
  await connectDatabase();

  let apiStatus = "down";
  let apiResponseTime = null;
  let llmStatus = "down";
  let llmResponseTime = null;

  // Check API status (e.g., by hitting a health endpoint)
  const apiStartTime = Date.now();
  try {
    // For simplicity, we'll consider the API up if the server is running and can connect to DB
    // A more robust check would involve making an actual API call to a non-LLM endpoint
    apiStatus = "up"; 
    apiResponseTime = Date.now() - apiStartTime;
  } catch (error) {
    console.error("API check failed:", error.message);
    apiStatus = "down";
  }

  // Check LLM status
  const llmStartTime = Date.now();
  try {
    // Attempt a simple LLM call to check its responsiveness
    await ragService.init(); // Ensure RAG service is initialized
    const testQuestion = "Hello";
    const llmResponse = await ragService.ask(testQuestion);
    if (llmResponse && llmResponse.answer) {
      llmStatus = "up";
      llmResponseTime = Date.now() - llmStartTime;
    } else {
      llmStatus = "down";
    }
  } catch (error) {
    console.error("LLM check failed:", error.message);
    llmStatus = "down";
  }

  await recordStatus(apiStatus, llmStatus, apiResponseTime, llmResponseTime);
  console.log(`Recorded status: API ${apiStatus}, LLM ${llmStatus}`);
}

checkAndRecordStatus().catch((error) => {
  console.error("Failed to record status:", error);
  process.exit(1);
});
