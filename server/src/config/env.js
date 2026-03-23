import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config(); // Render uses dashboard env vars, local uses .env in current dir

function asNumber(value, fallback) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: asNumber(process.env.PORT, 5001),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongoUri:
    process.env.MONGO_URI || "mongodb://localhost:27017/college_rag_chatbot",
  // Free-tier optimized rate limiting: 30 requests per minute
  rateLimitWindowMs: asNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMax: asNumber(process.env.RATE_LIMIT_MAX, 30),
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  // Use faster, lighter models for free tier
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  claudeModel: process.env.CLAUDE_MODEL || "claude-3-haiku-20240307",
  // Free-tier optimized: fetch fewer chunks to reduce memory usage
  ragTopK: asNumber(process.env.RAG_TOP_K, 3),
  ragConfidenceThreshold: asNumber(process.env.RAG_CONFIDENCE_THRESHOLD, 0.55),
  vectorDbProvider: process.env.VECTOR_DB_PROVIDER || "local",
  pineconeApiKey: process.env.PINECONE_API_KEY || "",
  pineconeIndex: process.env.PINECONE_INDEX || "",
  pineconeNamespace: process.env.PINECONE_NAMESPACE || "college-knowledge",
  dataDir:
    process.env.DATA_DIR || path.resolve(__dirname, "../../data/sample"),
  chunksStorePath: path.resolve(__dirname, "../../storage/chunks.json"),
  vectorStorePath: path.resolve(__dirname, "../../storage/vectors.json"),
  jwtSecret: process.env.JWT_SECRET || "replace_me_with_strong_secret",
  agentUsername: process.env.AGENT_USERNAME || "agent",
  agentPassword: process.env.AGENT_PASSWORD || "agent123",
  agentJwtExpiry: process.env.AGENT_JWT_EXPIRY || "12h",
  // Free-tier optimizations
  mongoConnectionPoolSize: asNumber(process.env.MONGO_POOL_SIZE, 2),
  mongoMaxIdleTime: asNumber(process.env.MONGO_MAX_IDLE_TIME, 30000),
  cacheStatusLogs: process.env.CACHE_STATUS_LOGS !== "false", // Cache for 5 minutes by default
};

export const isProd = env.nodeEnv === "production";
