import { OpenAIEmbeddings } from "@langchain/openai";
import { env } from "../../config/env.js";

const HASH_DIMENSIONS = 1536;

function hashToken(token) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hashedVector(text) {
  const tokens = tokenize(text);
  if (!tokens.length) {
    return Array(HASH_DIMENSIONS).fill(0);
  }

  const vector = Array(HASH_DIMENSIONS).fill(0);
  for (const token of tokens) {
    const h = hashToken(token);
    const index = h % HASH_DIMENSIONS;
    const sign = (h & 1) === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm <= 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}

export function createEmbeddings() {
  if (env.openaiApiKey) {
    return new OpenAIEmbeddings({
      openAIApiKey: env.openaiApiKey,
      modelName: "text-embedding-3-small",
      dimensions: HASH_DIMENSIONS,
    });
  }

  if (!(env.vectorDbProvider === "pinecone" && env.pineconeIntegratedEmbedding)) {
    console.warn("OPENAI_API_KEY not set. Falling back to deterministic hash embeddings.");
  }
  return {
    embedQuery: async (text) => hashedVector(text),
    embedDocuments: async (texts) => texts.map((text) => hashedVector(text)),
  };
}

export class HashEmbeddings {
  async embedQuery(text) {
    return hashedVector(text);
  }

  async embedDocuments(texts) {
    return texts.map((text) => hashedVector(text));
  }
}
