import { OpenAIEmbeddings } from "@langchain/openai";
import { env } from "../../config/env.js";

export function createEmbeddings() {
  if (env.openaiApiKey) {
    return new OpenAIEmbeddings({
      openAIApiKey: env.openaiApiKey,
      modelName: "text-embedding-3-small",
      dimensions: 1536,
    });
  }

  // Fallback to a dummy class that matches the interface if no key is provided
  // This prevents the app from crashing during initialization if the key is missing
  return {
    embedQuery: async (text) => Array(1536).fill(0),
    embedDocuments: async (texts) => texts.map(() => Array(1536).fill(0)),
  };
}

// Keep the legacy exports for compatibility if needed, but they are no longer used by the main service
export class HashEmbeddings {
  async embedQuery(text) { return Array(1536).fill(0); }
  async embedDocuments(texts) { return texts.map(() => Array(1536).fill(0)); }
}
