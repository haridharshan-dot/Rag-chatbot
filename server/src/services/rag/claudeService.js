import { ChatAnthropic } from "@langchain/anthropic";
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

function cleanFallbackLine(line) {
  return String(line || "")
    .replace(/\s+/g, " ")
    .replace(/(^|[\s,])([a-z_]+):/gi, (_, prefix, key) => `${prefix}${key.replace(/_/g, " ")}: `)
    .trim();
}

export class ClaudeService {
  constructor({ apiKey, model }) {
    this.model = model;
    this.client = apiKey
      ? new ChatAnthropic({
          anthropicApiKey: apiKey,
          model,
          temperature: 0.1,
          maxTokens: 450,
        })
      : null;

    this.prompt = PromptTemplate.fromTemplate(
      [
        "You are a college assistant AI.",
        "Use ONLY the supplied CONTEXT to answer.",
        "Do NOT use your own knowledge.",
        "Do NOT guess or assume.",
        "If the answer is not in CONTEXT, reply exactly:",
        "The live agent option is on top. Please activate it and talk to a live agent.",
        "Answer ONLY what the user asked.",
        "Do NOT include extra or unrelated information.",
        "Response must be: clear, short, relevant, direct.",
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
        .map(cleanFallbackLine)
        .slice(0, 5);
      return {
        content:
          focusedLines.length > 0
            ? `Here is what I found:\n- ${focusedLines.join("\n- ")}`
            : "The live agent option is on top. Please activate it and talk to a live agent.",
      };
    };

    if (!this.client) {
      return buildRetrievalAnswer();
    }

    try {
      const chain = this.prompt.pipe(this.client).pipe(this.parser);
      const content = await chain.invoke({ question, context: contextBlock });

      return { content: content || "I could not generate an answer." };
    } catch (error) {
      console.warn("Claude invocation failed, using retrieval-only response:", error?.message || error);
      return buildRetrievalAnswer();
    }
  }
}
