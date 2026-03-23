import { Embeddings } from "@langchain/core/embeddings";

const EMBEDDING_DIMENSIONS = 256;

function hashToken(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalize(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

export function embedText(text) {
  const vector = Array(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean);

  for (const token of tokens) {
    const index = hashToken(token) % EMBEDDING_DIMENSIONS;
    vector[index] += 1;
  }

  return normalize(vector);
}

export function cosineSimilarity(a, b) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let score = 0;
  for (let i = 0; i < a.length; i += 1) {
    score += a[i] * b[i];
  }
  return score;
}

export class HashEmbeddings extends Embeddings {
  constructor(params) {
    super(params);
  }

  async embedQuery(text) {
    return embedText(text);
  }

  async embedDocuments(texts) {
    return texts.map((text) => embedText(text));
  }
}
