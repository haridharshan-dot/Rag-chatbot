import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env files from common local run locations.
// Existing process env vars (for example Render dashboard vars) take precedence.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") }); // repo root .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") }); // server/.env
dotenv.config(); // current working directory fallback

function asNumber(value, fallback) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asList(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

const configuredClientUrls = asList(process.env.CLIENT_URLS, asList(process.env.CLIENT_URL));
const defaultClientUrls = configuredClientUrls.length
  ? configuredClientUrls
  : ["http://localhost:5173"];

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: asNumber(process.env.PORT, 5001),
  clientUrl: defaultClientUrls[0],
  clientUrls: defaultClientUrls,
  mongoUri:
    process.env.MONGO_URI || "mongodb://localhost:27017/college_rag_chatbot",
  // Free-tier optimized rate limiting: 30 requests per minute
  rateLimitWindowMs: asNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMax: asNumber(process.env.RATE_LIMIT_MAX, 30),
  // Accept multiple Gemini key variable names to avoid deployment misconfiguration.
  googleApiKey: asString(
    process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    ""
  ),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  // Use faster, lighter models for free tier
  geminiModel: asString(process.env.GEMINI_MODEL, "gemini-2.5-flash-lite"),
  geminiTimeoutMs: asNumber(process.env.GEMINI_TIMEOUT_MS, 9000),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  claudeModel: process.env.CLAUDE_MODEL || "claude-3-haiku-20240307",
  // Production defaults tuned for better retrieval coverage and controlled escalation
  ragTopK: asNumber(process.env.RAG_TOP_K, 5),
  ragConfidenceThreshold: asNumber(process.env.RAG_CONFIDENCE_THRESHOLD, 0.6),
  ragOutOfScopeThreshold: asNumber(process.env.RAG_OUT_OF_SCOPE_THRESHOLD, 0.45),
  vectorDbProvider: process.env.VECTOR_DB_PROVIDER || "local",
  pineconeApiKey: process.env.PINECONE_API_KEY || "",
  pineconeIndex: process.env.PINECONE_INDEX || "",
  pineconeNamespace: process.env.PINECONE_NAMESPACE || "college-knowledge",
  dataDir:
    process.env.DATA_DIR || path.resolve(__dirname, "../../../data/sample"),
  chunksStorePath: path.resolve(__dirname, "../../storage/chunks.json"),
  vectorStorePath: path.resolve(__dirname, "../../storage/vectors.json"),
  jwtSecret: process.env.JWT_SECRET || "replace_me_with_strong_secret",
  agentUsername: process.env.AGENT_USERNAME || "agent",
  agentEmail: (process.env.AGENT_EMAIL || "agent@sona.com").toLowerCase(),
  agentPassword: process.env.AGENT_PASSWORD || "agent123",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminEmail: (process.env.ADMIN_EMAIL || "admin@sona.com").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "admin@sona",
  agentJwtExpiry: process.env.AGENT_JWT_EXPIRY || "12h",
  otpTtlMinutes: asNumber(process.env.OTP_TTL_MINUTES, 5),
  otpMaxAttempts: asNumber(process.env.OTP_MAX_ATTEMPTS, 5),
  otpPreferredChannel: ["email", "mobile"].includes(asString(process.env.OTP_PREFERRED_CHANNEL, "mobile"))
    ? asString(process.env.OTP_PREFERRED_CHANNEL, "mobile")
    : "mobile",
  otpDebugExpose: asBoolean(process.env.OTP_DEBUG_EXPOSE, process.env.NODE_ENV !== "production"),
  smtpHost: asString(process.env.SMTP_HOST, ""),
  smtpPort: asNumber(process.env.SMTP_PORT, 587),
  smtpSecure: asBoolean(process.env.SMTP_SECURE, false),
  smtpUser: asString(process.env.SMTP_USER, ""),
  smtpPass: asString(process.env.SMTP_PASS, ""),
  smtpFrom: asString(process.env.SMTP_FROM, ""),
  twilioAccountSid: asString(process.env.TWILIO_ACCOUNT_SID, ""),
  twilioAuthToken: asString(process.env.TWILIO_AUTH_TOKEN, ""),
  twilioFromNumber: asString(process.env.TWILIO_FROM_NUMBER, ""),
  microsoftAuthEnabled: process.env.MICROSOFT_AUTH_ENABLED === "true",
  microsoftAllowedDomains: asList(process.env.MICROSOFT_ALLOWED_DOMAINS),
  microsoftAllowedEmails: asList(process.env.MICROSOFT_ALLOWED_EMAILS),
  googleClientId: asString(process.env.GOOGLE_CLIENT_ID, ""),
  // Free-tier optimizations
  mongoConnectionPoolSize: asNumber(process.env.MONGO_POOL_SIZE, 2),
  mongoMaxIdleTime: asNumber(process.env.MONGO_MAX_IDLE_TIME, 30000),
  cacheStatusLogs: process.env.CACHE_STATUS_LOGS !== "false", // Cache for 5 minutes by default
};

export const isProd = env.nodeEnv === "production";

export function validateEnvironment() {
  const errors = [];
  const warnings = [];

  if (isProd) {
    if (!process.env.MONGO_URI) {
      errors.push("MONGO_URI is required in production");
    }

    if (!process.env.JWT_SECRET || env.jwtSecret === "replace_me_with_strong_secret") {
      errors.push("JWT_SECRET must be set to a strong value in production");
    }

    if (!env.clientUrls.length) {
      errors.push("CLIENT_URL or CLIENT_URLS must be set in production");
    }

    if (env.vectorDbProvider === "pinecone") {
      if (!env.pineconeApiKey) {
        errors.push("PINECONE_API_KEY is required when VECTOR_DB_PROVIDER=pinecone");
      }
      if (!env.pineconeIndex) {
        errors.push("PINECONE_INDEX is required when VECTOR_DB_PROVIDER=pinecone");
      }
    }

    if (!env.googleApiKey && !env.anthropicApiKey) {
      warnings.push(
        "No LLM API key configured (GOOGLE_API_KEY or ANTHROPIC_API_KEY). Responses will be retrieval-only summaries."
      );
    }

    if (env.ragOutOfScopeThreshold >= env.ragConfidenceThreshold) {
      warnings.push(
        "RAG_OUT_OF_SCOPE_THRESHOLD should usually be lower than RAG_CONFIDENCE_THRESHOLD for clean escalation behavior."
      );
    }
  }

  if (errors.length) {
    throw new Error(`Invalid environment configuration: ${errors.join("; ")}`);
  }

  for (const warning of warnings) {
    console.warn(`Config warning: ${warning}`);
  }
}
