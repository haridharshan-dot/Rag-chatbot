import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

function classifyIntent(question) {
  const q = String(question || "").toLowerCase();
  if (/\bdocuments?|marksheet|certificate|id proof|passport|required docs?\b/.test(q)) return "documents";
  if (/\bhostel\b/.test(q)) return "hostel_fee";
  if (/\btuition\b/.test(q)) return "tuition_fee";
  if (/\blab\b|\bexam fee\b/.test(q)) return "lab_fee";
  if (/\bfees?\b|\bfee structure\b/.test(q)) return "fees";
  if (/\bcutoff|cut off\b/.test(q)) return "cutoff";
  if (/\bdeadline|last date|counselling\b/.test(q)) return "deadline";
  if (/\beligibility|criteria\b/.test(q)) return "eligibility";
  if (/\bcourses?|programs?|department\b/.test(q)) return "courses";
  return "general";
}

function pickRelevantLines(text, intent) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const matchers = {
    documents: /(document|required|marksheet|certificate|id proof|passport|transfer|photo)/i,
    hostel_fee: /(hostel|accommodation|mess|boarding)/i,
    tuition_fee: /(tuition|semester fee|college fee)/i,
    lab_fee: /(lab|exam fee)/i,
    fees: /(fee|tuition|hostel|lab|exam)/i,
    cutoff: /(cutoff|category|oc|min|max|rank)/i,
    deadline: /(deadline|last date|counselling|june|july|august|september)/i,
    eligibility: /(eligibility|criteria|10\+2|required marks|pcm)/i,
    courses: /(course|program|cse|ece|mechanical|civil|it|ai\/ml)/i,
    general: /./,
  };

  const regex = matchers[intent] || matchers.general;
  const selected = lines.filter((line) => regex.test(line)).slice(0, 4);
  if (selected.length) return selected;
  return lines.slice(0, 3);
}

export class GeminiService {
  constructor({ apiKey, model, timeoutMs = 9000 }) {
    this.model = model;
    this.timeoutMs = Math.max(3000, Number(timeoutMs) || 9000);
    this.client = apiKey
      ? new ChatGoogleGenerativeAI({
          apiKey,
          model,
          temperature: 0.1,
          maxOutputTokens: 260,
        })
      : null;

    this.prompt = PromptTemplate.fromTemplate(
      [
        "You are a precise college admissions assistant.",
        "Use only the supplied context.",
        "The dataset can include cutoffs, seats, department codes, categories, years, fees, eligibility, deadlines, and policies.",
        "Answer any of these topics when available in context, not just cutoff questions.",
        "Answer only what the user asked. Do not add unrelated details.",
        "If user asks hostel fee, return only hostel fee. If user asks documents, return only required documents.",
        "If context is insufficient, clearly say so and suggest connecting to a live agent.",
        "For cutoff questions, answer in a compact category-wise format with year and department first.",
        "If category data is unavailable, explicitly write 'not available in dataset' for that category.",
        "Keep answers factual, short, and non-promotional.",
        "",
        "Question:",
        "{question}",
        "",
        "Context:",
        "{context}",
      ].join("\n")
    );
    this.parser = new StringOutputParser();
  }

  async answer({ question, contextChunks }) {
    const contextBlock = contextChunks
      .map((chunk, index) => `[Source ${index + 1}: ${chunk.source}]\n${chunk.text}`)
      .join("\n\n");

    const buildRetrievalAnswer = () => {
      const intent = classifyIntent(question);
      const focusedLines = contextChunks
        .slice(0, 3)
        .flatMap((chunk) => pickRelevantLines(chunk.text, intent))
        .slice(0, 5);
      const condensedContext = focusedLines.join("\n").slice(0, 600);
      return {
        content: condensedContext
          ? `Based on college dataset:\n${condensedContext}`
          : "I could not find exact information for your question in the dataset.",
      };
    };

    if (!this.client) {
      return buildRetrievalAnswer();
    }

    try {
      const chain = this.prompt.pipe(this.client).pipe(this.parser);
      const timeoutError = new Error("Gemini request timed out");
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(timeoutError), this.timeoutMs);
      });

      const content = await Promise.race([
        chain.invoke({ question, context: contextBlock }),
        timeoutPromise,
      ]);

      return { content: content || "I could not generate an answer." };
    } catch (error) {
      console.warn("Gemini invocation failed, using retrieval-only response:", error?.message || error);
      return buildRetrievalAnswer();
    }
  }
}
