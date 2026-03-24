import { checkAndRecordStatus } from "../services/statusService.js";
import { connectDatabase } from "../config/db.js";

async function run() {
  await connectDatabase();
  const status = await checkAndRecordStatus();
  console.log(`Recorded status: API ${status.apiStatus}, LLM ${status.llmStatus}`);
}

run().catch((error) => {
  console.error("Failed to record status:", error);
  process.exit(1);
});
