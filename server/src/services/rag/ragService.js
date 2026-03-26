import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { GeminiService } from "./geminiService.js";
import { ClaudeService } from "./claudeService.js";
import { createVectorStore } from "./vectorStore.js";
import { createEmbeddings } from "./embeddingService.js";
import { loadChunksFromDirectory } from "./chunkService.js";
import { getRuntimeSettings } from "../adminSettingsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function getCandidateDataDirs() {
  return [
    env.dataDir,
    path.resolve(process.cwd(), "data/sample"),
    path.resolve(process.cwd(), "server/data/sample"),
    path.resolve(__dirname, "../../../../data/sample"),
    path.resolve(__dirname, "../../../data/sample"),
  ].filter(Boolean);
}

function isCutoffQuestion(question) {
  return /\bcutoff|cut off\b/i.test(String(question || ""));
}

function isRestrictedFeeQuestion(question) {
  return /\bfees?\b|\bfee structure\b|\btuition\b|\bpayment\b|\brefund\b|\binstallment\b|\bhostel fee\b|\blab fee\b|\bexam fee\b/i.test(
    String(question || "")
  );
}

function extractRequestedYear(question) {
  const match = String(question || "").match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function normalizeDepartmentName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getDepartmentAliases(entry) {
  const department = String(entry?.department || "").trim();
  const code = String(entry?.code || "").trim();
  const normalizedCode = normalizeDepartmentName(code);
  const aliases = new Set([
    normalizeDepartmentName(department),
    normalizedCode,
  ]);

  if (normalizedCode === "aml") {
    aliases.add("aiml");
    aliases.add("ai ml");
    aliases.add("ai and ml");
    aliases.add("artificial intelligence machine learning");
  }

  if (normalizedCode === "ads") {
    aliases.add("aids");
    aliases.add("ai ds");
    aliases.add("ai and ds");
    aliases.add("ai data science");
  }

  if (normalizedCode === "mech") {
    aliases.add("mechanical");
  }

  return [...aliases].filter(Boolean);
}

function findRequestedDepartment(question, departments) {
  const q = normalizeDepartmentName(question);
  if (!q) return null;
  const tokens = q.split(" ");

  for (const entry of departments) {
    const aliases = getDepartmentAliases(entry);
    const matched = aliases.some((alias) => {
      if (!alias) return false;
      return q.includes(alias) || tokens.includes(alias);
    });
    if (matched) {
      return entry;
    }
  }

  return null;
}

function formatCategoryLine(category, values) {
  if (!values || typeof values !== "object") {
    return `- ${category}: not published for this year`;
  }
  const max = values.max ?? "NA";
  const min = values.min ?? "NA";
  return `- ${category}: max ${max}, min ${min}`;
}

function buildDepartmentCutoffAnswer({ year, department, yearEntry }) {
  const cutoff = yearEntry?.cutoff && typeof yearEntry.cutoff === "object" ? yearEntry.cutoff : {};
  const categories = Object.keys(cutoff);
  const unpublishedCount = categories.filter((category) => {
    const values = cutoff[category];
    return !values || typeof values !== "object";
  }).length;
  const lines = [
    `## ${year} Cutoffs`,
    `**Department:** ${department.department} (${department.code})`,
  ];

  if (yearEntry?.available_seats !== null && yearEntry?.available_seats !== undefined) {
    lines.push(`**Available seats:** ${yearEntry.available_seats}`);
  }

  if (!categories.length) {
    lines.push("Cutoff details are not available in the dataset.");
    return lines.join("\n\n");
  }

  lines.push(categories.map((category) => formatCategoryLine(category, cutoff[category])).join("\n"));
  if (unpublishedCount > 0) {
    lines.push("*Some community/category cutoffs were not published in the official counselling data.*");
  }
  return lines.join("\n\n");
}

function buildYearSummaryAnswer({ year, departments }) {
  const lines = [
    `## ${year} Cutoff Summary`,
    "| Department | Code | Seats | OC cutoff |",
    "| --- | --- | ---: | --- |",
  ];

  for (const department of departments) {
    const yearEntry = (Array.isArray(department?.years) ? department.years : []).find(
      (item) => Number(item?.year) === Number(year)
    );
    if (!yearEntry) continue;
    const oc = yearEntry?.cutoff?.OC;
    const ocLabel = oc && typeof oc === "object" ? `${oc.max ?? "NA"} / ${oc.min ?? "NA"}` : "NA";
    const seats = yearEntry?.available_seats ?? "NA";
    lines.push(`| ${department.department} | ${department.code || "NA"} | ${seats} | ${ocLabel} |`);
  }

  lines.push("");
  lines.push("Ask for a specific department like `CSE 2025 cutoff` to get full category-wise values.");
  return lines.join("\n");
}

async function readStructuredCutoffDataset(dataDirs) {
  for (const dataDir of dataDirs) {
    try {
      const entries = await fs.readdir(dataDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue;
        const fullPath = path.join(dataDir, entry.name);
        const content = await fs.readFile(fullPath, "utf8");
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.cutoff_data)) {
          return {
            source: path.relative(process.cwd(), fullPath),
            parsed,
          };
        }
      }
    } catch {
      // Try next directory candidate.
    }
  }

  return null;
}

async function buildStructuredCutoffResponse(question, dataDirs) {
  if (!isCutoffQuestion(question)) return null;

  const dataset = await readStructuredCutoffDataset(dataDirs);
  if (!dataset?.parsed) return null;

  const departments = Array.isArray(dataset.parsed.cutoff_data) ? dataset.parsed.cutoff_data : [];
  if (!departments.length) return null;

  const requestedYear =
    extractRequestedYear(question) ||
    Math.max(
      ...departments.flatMap((department) =>
        (Array.isArray(department?.years) ? department.years : [])
          .map((entry) => Number(entry?.year))
          .filter(Number.isFinite)
      )
    );

  if (!Number.isFinite(requestedYear)) return null;

  const department = findRequestedDepartment(question, departments);

  if (department) {
    const yearEntry = (Array.isArray(department.years) ? department.years : []).find(
      (item) => Number(item?.year) === Number(requestedYear)
    );

    if (!yearEntry) {
      return {
        answer: `The dataset does not contain cutoff data for ${department.department} in ${requestedYear}.`,
        source: dataset.source,
      };
    }

    return {
      answer: buildDepartmentCutoffAnswer({
        year: requestedYear,
        department,
        yearEntry,
      }),
      source: dataset.source,
    };
  }

  const matchingDepartments = departments.filter((entry) =>
    (Array.isArray(entry?.years) ? entry.years : []).some(
      (item) => Number(item?.year) === Number(requestedYear)
    )
  );

  if (!matchingDepartments.length) {
    return {
      answer: `The dataset does not contain cutoff information for ${requestedYear}.`,
      source: dataset.source,
    };
  }

  return {
    answer: buildYearSummaryAnswer({
      year: requestedYear,
      departments: matchingDepartments,
    }),
    source: dataset.source,
  };
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
    this.lastDatasetDir = null;
  }

  async loadChunks() {
    const uniqueDataDirs = [...new Set(getCandidateDataDirs())];

    for (const dataDir of uniqueDataDirs) {
      try {
        await fs.access(dataDir);
        const chunksFromDir = await loadChunksFromDirectory(dataDir);
        if (chunksFromDir.length) {
          this.lastDatasetDir = path.resolve(dataDir);
          return chunksFromDir;
        }
      } catch {
        // Try next available dataset directory.
      }
    }

    try {
      const file = await fs.readFile(env.chunksStorePath, "utf8");
      const parsed = JSON.parse(file);
      if (Array.isArray(parsed?.chunks) && parsed.chunks.length) {
        this.lastDatasetDir = null;
        return parsed.chunks;
      }
    } catch {
      // No persisted chunks available.
    }

    return [];
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
      datasetDir: this.lastDatasetDir,
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
        if (!this.vectorStore.pineconeIntegratedEmbedding) {
          await this.vectorStore.initPineconeStore();
        }
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
      return { provider: "pinecone", chunkCount: chunks.length, dataDir: this.lastDatasetDir };
    }

    await this.vectorStore.buildFromChunks(chunks);
    this.ready = true;
    return { provider: "local", chunkCount: chunks.length, dataDir: this.lastDatasetDir };
  }

  async ask(question, options = {}) {
    await this.init();
    const settings = await getRuntimeSettings();
    const supplementalContext = String(options?.supplementalContext || "").trim();
    const uniqueDataDirs = [...new Set(getCandidateDataDirs())];

    if (isGreetingOnly(question)) {
      return {
        answer:
          "Hi! I can help with admissions, cutoffs, courses, scholarships, documents, and deadlines. Ask your specific college question.",
        confidence: 1,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    if (isRestrictedFeeQuestion(question)) {
      return {
        answer:
          "Fee details are not shared in this public chatbot. Please contact the admissions office or use the live agent for fee-related help.",
        confidence: 1,
        sources: [],
        escalationSuggested: false,
        outOfScope: false,
      };
    }

    const structuredCutoffResponse = await buildStructuredCutoffResponse(question, uniqueDataDirs);
    if (structuredCutoffResponse) {
      return {
        answer: structuredCutoffResponse.answer,
        confidence: 1,
        sources: [structuredCutoffResponse.source],
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
