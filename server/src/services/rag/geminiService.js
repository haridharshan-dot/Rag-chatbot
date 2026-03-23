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
        "If context is insufficient, clearly say so and suggest connecting to a live agent.",
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
