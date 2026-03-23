import fs from "node:fs/promises";
import { env } from "../../config/env.js";
import { ClaudeService } from "./claudeService.js";
import { createVectorStore } from "./vectorStore.js";
import { HashEmbeddings } from "./embeddingService.js";
import { loadChunksFromDirectory } from "./chunkService.js";

function normalizeScore(rawScore) {
  if (!Number.isFinite(rawScore)) return 0;

  if (rawScore >= -1 && rawScore <= 1) {
    return (rawScore + 1) / 2;
  }

  return 1 / (1 + Math.max(rawScore, 0));
}

class RAGService {
  constructor() {
    this.vectorStore = createVectorStore(new HashEmbeddings({}));
    this.claude = new ClaudeService({
      apiKey: env.anthropicApiKey,
      model: env.claudeModel,
    });
    this.ready = false;
  }

  async init() {
    if (this.ready) return;

    let chunks = [];
    try {
      const file = await fs.readFile(env.chunksStorePath, "utf8");
      const parsed = JSON.parse(file);
      chunks = parsed.chunks || [];
    } catch {
      chunks = await loadChunksFromDirectory(env.dataDir);
    }

    try {
      await this.vectorStore.buildFromChunks(chunks);
    } catch (error) {
      if (env.vectorDbProvider !== "pinecone") {
        throw error;
      }

      // Keep chatbot functional even when Pinecone is unavailable.
      console.warn("Falling back to local vector store:", error.message);
      const { LangChainVectorStore } = await import("./vectorStore.js");
      this.vectorStore = new LangChainVectorStore(new HashEmbeddings({}), {
        provider: "local",
      });
      await this.vectorStore.buildFromChunks(chunks);
    }
    this.ready = true;
  }

  async ask(question) {
    await this.init();

    const results = await this.vectorStore.similaritySearch(question, env.ragTopK);
    const topScores = results.map((item) => normalizeScore(item.score));
    const confidence = topScores.length
      ? topScores.reduce((a, b) => a + b, 0) / topScores.length
      : 0;

    const contextChunks = results.map((item) => ({
      source: item.source,
      text: item.text,
      score: item.score,
    }));

    if (!contextChunks.length) {
      return {
        answer:
          "I could not find relevant college information. Please connect to a live agent for help.",
        confidence: 0,
        sources: [],
        escalationSuggested: true,
      };
    }

    const modelAnswer = await this.claude.answer({ question, contextChunks });

    return {
      answer: modelAnswer.content,
      confidence,
      sources: contextChunks.map((chunk) => chunk.source),
      escalationSuggested: confidence < env.ragConfidenceThreshold,
    };
  }
}

export const ragService = new RAGService();
