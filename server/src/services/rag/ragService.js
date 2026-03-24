import fs from "node:fs/promises";
import { env } from "../../config/env.js";
import { GeminiService } from "./geminiService.js";
import { ClaudeService } from "./claudeService.js";
import { createVectorStore } from "./vectorStore.js";
import { createEmbeddings } from "./embeddingService.js";
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
    this.vectorStore = createVectorStore(createEmbeddings());
    this.gemini = new GeminiService({
      apiKey: env.googleApiKey,
      model: env.geminiModel,
    });
    this.claude = new ClaudeService({
      apiKey: env.anthropicApiKey,
      model: env.claudeModel,
    }); // fallback
    this.ready = false;
  }

  getStatus() {
    return {
      provider: env.vectorDbProvider,
      initialized: this.ready,
      llmProvider: env.googleApiKey
        ? "gemini"
        : env.anthropicApiKey
          ? "claude"
          : "retrieval-only",
    };
  }

  async ensurePineconeSeeded(chunks) {
    if (!chunks.length) return;

    const bootstrapResults = await this.vectorStore.similaritySearch(
      "college admission cutoff fees eligibility",
      1
    );

    if (bootstrapResults.length > 0) return;

    console.log("Pinecone index appears empty. Seeding from local dataset chunks...");
    await this.vectorStore.buildFromChunks(chunks);
  }

  async init() {
    if (this.ready) return;

    let chunks = [];
    try {
      const file = await fs.readFile(env.chunksStorePath, "utf8");
      const parsed = JSON.parse(file);
      chunks = parsed.chunks || [];
    } catch {
      try {
        await fs.access(env.dataDir);
        chunks = await loadChunksFromDirectory(env.dataDir);
      } catch (error) {
        console.warn(`Data directory not found at ${env.dataDir}. Starting with empty knowledge base.`);
        chunks = [];
      }
    }

    try {
      if (env.vectorDbProvider === "pinecone") {
        await this.vectorStore.initPineconeStore();
        await this.ensurePineconeSeeded(chunks);
      } else {
        await this.vectorStore.buildFromChunks(chunks);
      }
    } catch (error) {
      console.warn("Falling back to local vector store:", error.message);
      const { LangChainVectorStore } = await import("./vectorStore.js");
      this.vectorStore = new LangChainVectorStore(createEmbeddings(), {
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

    const modelAnswer = env.googleApiKey
      ? await this.gemini.answer({ question, contextChunks })
      : await this.claude.answer({ question, contextChunks });

    return {
      answer: modelAnswer.content,
      confidence,
      sources: contextChunks.map((chunk) => chunk.source),
      escalationSuggested: confidence < env.ragConfidenceThreshold,
    };
  }
}

export const ragService = new RAGService();
