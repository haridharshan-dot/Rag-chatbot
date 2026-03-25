import fs from "node:fs/promises";
import { env } from "../../config/env.js";
import { GeminiService } from "./geminiService.js";
import { ClaudeService } from "./claudeService.js";
import { createVectorStore } from "./vectorStore.js";
import { createEmbeddings } from "./embeddingService.js";
import { loadChunksFromDirectory } from "./chunkService.js";
import { getRuntimeSettings } from "../adminSettingsService.js";

function normalizeScore(rawScore) {
  if (!Number.isFinite(rawScore)) return 0;

  if (rawScore >= -1 && rawScore <= 1) {
    return (rawScore + 1) / 2;
  }

  return 1 / (1 + Math.max(rawScore, 0));
}

function isGreetingOnly(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(hi|hii|hello|hey|yo|good morning|good afternoon|good evening)$/.test(normalized);
}

class RAGService {
  constructor() {
    this.vectorStore = createVectorStore(createEmbeddings());
    this.gemini = new GeminiService({
      apiKey: env.googleApiKey,
      model: env.geminiModel,
      timeoutMs: env.geminiTimeoutMs,
    });
    this.claude = new ClaudeService({
      apiKey: env.anthropicApiKey,
      model: env.claudeModel,
    }); // fallback
    this.ready = false;
  }

  async loadChunks() {
    let chunks = [];
    try {
      const file = await fs.readFile(env.chunksStorePath, "utf8");
      const parsed = JSON.parse(file);
      chunks = parsed.chunks || [];
    } catch {
      try {
        await fs.access(env.dataDir);
        chunks = await loadChunksFromDirectory(env.dataDir);
      } catch {
        chunks = [];
      }
    }
    return chunks;
  }

  getStatus() {
    const llmProvider = env.googleApiKey
      ? "gemini"
      : env.anthropicApiKey
        ? "claude"
        : "retrieval-only";

    return {
      provider: env.vectorDbProvider,
      initialized: this.ready,
      llmProvider,
      llmModel:
        llmProvider === "gemini"
          ? env.geminiModel
          : llmProvider === "claude"
            ? env.claudeModel
            : "none",
      llmConfigured: Boolean(env.googleApiKey || env.anthropicApiKey),
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

    const chunks = await this.loadChunks();

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

  async reindex() {
    const chunks = await this.loadChunks();

    if (env.vectorDbProvider === "pinecone") {
      await this.vectorStore.buildFromChunks(chunks);
      this.ready = true;
      return { provider: "pinecone", chunkCount: chunks.length };
    }

    await this.vectorStore.buildFromChunks(chunks);
    this.ready = true;
    return { provider: "local", chunkCount: chunks.length };
  }

  async ask(question, options = {}) {
    await this.init();
    const settings = await getRuntimeSettings();
    const supplementalContext = String(options?.supplementalContext || "").trim();

    if (isGreetingOnly(question)) {
      return {
        answer:
          "Hi! I can help with admissions, fees, cutoffs, courses, and deadlines. Ask your specific college question.",
        confidence: 1,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    const results = await this.vectorStore.similaritySearch(question, settings.ragTopK);
    const topScores = results.map((item) => normalizeScore(item.score));
    const averageScore = topScores.length
      ? topScores.reduce((a, b) => a + b, 0) / topScores.length
      : 0;
    const bestScore = topScores.length ? Math.max(...topScores) : 0;
    let confidence = topScores.length
      ? bestScore * 0.7 + averageScore * 0.3
      : 0;

    const contextChunks = results.map((item) => ({
      source: item.source,
      text: item.text,
      score: item.score,
    }));

    if (supplementalContext) {
      contextChunks.unshift({
        source: "embedded-site-context",
        text: supplementalContext,
        score: 1,
      });
      if (!results.length) {
        confidence = Math.max(confidence, settings.ragConfidenceThreshold + 0.05);
      }
    }

    if (!contextChunks.length) {
      return {
        answer:
          "I could not find relevant college information. Please connect to a live agent for help.",
        confidence: 0,
        sources: [],
        escalationSuggested: true,
        outOfScope: true,
      };
    }

    const modelAnswer = env.googleApiKey
      ? await this.gemini.answer({ question, contextChunks })
      : await this.claude.answer({ question, contextChunks });

    return {
      answer: modelAnswer.content,
      confidence,
      sources: contextChunks.map((chunk) => chunk.source),
      escalationSuggested:
        confidence < settings.ragConfidenceThreshold &&
        bestScore < settings.ragOutOfScopeThreshold * 0.9,
      outOfScope: bestScore < settings.ragOutOfScopeThreshold * 0.9,
    };
  }
}

export const ragService = new RAGService();
