import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

function hasMeaningfulQuery(query) {
  const normalized = String(query || "").trim();
  if (!normalized) return false;
  if (/^[\s.,!?-]+$/.test(normalized)) return false;
  return true;
}

export class GeminiService {
  constructor({ apiKey, model, timeoutMs = 9000 }) {
    this.model = model;
    this.timeoutMs = Math.max(3000, Number(timeoutMs) || 9000);
    this.apiKey = process.env.GOOGLE_API_KEY || apiKey || "";
    this.client = this.apiKey
      ? new ChatGoogleGenerativeAI({
          apiKey: this.apiKey,
          model,
          temperature: 0.2,
          maxOutputTokens: 700,
        })
      : null;

    this.prompt = PromptTemplate.fromTemplate(
      [
        "You are a helpful AI assistant.",
        "If asked about identity/creator, answer: AIML Team.",
        "Never say: I am a large language model, trained by Google.",
        "If CONTEXT is relevant, prioritize it.",
        "If CONTEXT is empty or not relevant, still answer the question directly.",
        "Keep the response concise, correct, and clear.",
        "",
        "QUESTION:",
        "{question}",
        "",
        "CONTEXT:",
        "{context}",
      ].join("\n")
    );
    this.parser = new StringOutputParser();
  }

  async answer({ question, contextChunks = [], allowGeneral = false }) {
    if (!hasMeaningfulQuery(question)) {
      return {
        content: "Please ask a question so I can help you.",
        confidence: 0,
        needsAgent: false,
      };
    }

    const topChunks = Array.isArray(contextChunks) ? contextChunks.slice(0, 4) : [];
    const contextBlock = topChunks.length
      ? topChunks
          .map((chunk, index) => `[Source ${index + 1}: ${chunk.source}]\n${String(chunk.text || "")}`)
          .join("\n\n---\n\n")
      : "No supporting context provided.";

    if (!this.client) {
      return {
        content: allowGeneral
          ? "I’m unable to generate a full answer right now. Please try again in a moment."
          : "Sorry, I couldn't find exact information. Please connect to a live agent for further assistance.",
        confidence: 0,
        needsAgent: !allowGeneral,
      };
    }

    try {
      const chain = this.prompt.pipe(this.client).pipe(this.parser);
      const timeoutError = new Error("Gemini request timed out");
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(timeoutError), this.timeoutMs);
      });

      const content = await Promise.race([
        chain.invoke({
          question: String(question || "").trim(),
          context: contextBlock,
        }),
        timeoutPromise,
      ]);

      const trimmed = String(content || "").trim();
      if (!trimmed) {
        return {
          content: "I don’t have enough details to answer that clearly. Please rephrase your question.",
          confidence: 0.2,
          needsAgent: false,
        };
      }

      const confidence = topChunks.length ? 0.85 : 0.6;
      return {
        content: trimmed.slice(0, 1600),
        confidence,
        needsAgent: false,
      };
    } catch (error) {
      console.error("Gemini error:", error?.message || error);
      return {
        content: allowGeneral
          ? "I’m unable to generate a full answer right now. Please try again in a moment."
          : "Sorry, I couldn't find exact information. Please connect to a live agent for further assistance.",
        confidence: 0,
        needsAgent: !allowGeneral,
      };
    }
  }
}
