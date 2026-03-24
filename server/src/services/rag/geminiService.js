import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export class GeminiService {
  constructor({ apiKey, model }) {
    this.model = model;
    this.client = apiKey
      ? new ChatGoogleGenerativeAI({
          apiKey,
          model,
          temperature: 0.1,
          maxOutputTokens: 450,
        })
      : null;

    this.prompt = PromptTemplate.fromTemplate(
      [
        "You are a precise college admissions assistant.",
        "Use only the supplied context.",
        "The dataset can include cutoffs, seats, department codes, categories, years, fees, eligibility, deadlines, and policies.",
        "Answer any of these topics when available in context, not just cutoff questions.",
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

    if (!this.client) {
      return {
        content:
          `Based on college knowledge:\n\n${contextBlock.slice(0, 700)}\n\n` +
          `Question: ${question}\n` +
          "Configure GOOGLE_API_KEY for high-quality Gemini responses.",
      };
    }

    const chain = this.prompt.pipe(this.client).pipe(this.parser);
    const content = await chain.invoke({ question, context: contextBlock });

    return { content: content || "I could not generate an answer." };
  }
}
