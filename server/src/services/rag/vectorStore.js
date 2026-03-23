import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { env } from "../../config/env.js";

export class LangChainVectorStore {
  constructor(embeddings, options = {}) {
    this.embeddings = embeddings;
    this.provider = options.provider || "local";
    this.namespace = options.namespace || "college-knowledge";
    this.pineconeApiKey = options.pineconeApiKey || "";
    this.pineconeIndex = options.pineconeIndex || "";
    this.store = null;
  }

  toDocuments(chunks) {
    return chunks.map(
      (chunk) =>
        new Document({
          pageContent: chunk.text,
          metadata: {
            id: chunk.id,
            source: chunk.source,
          },
        })
    );
  }

  async initPineconeStore() {
    const [{ PineconeStore }, { Pinecone: PineconeClient }] = await Promise.all([
      import("@langchain/pinecone"),
      import("@pinecone-database/pinecone"),
    ]);

    const client = new PineconeClient({ apiKey: this.pineconeApiKey });
    const index = client.Index(this.pineconeIndex);

    this.store = await PineconeStore.fromExistingIndex(this.embeddings, {
      pineconeIndex: index,
      namespace: this.namespace,
      textKey: "text",
    });
  }

  async buildFromChunks(chunks) {
    const docs = this.toDocuments(chunks);

    if (this.provider === "pinecone") {
      if (!this.pineconeApiKey || !this.pineconeIndex) {
        throw new Error("Pinecone provider selected but credentials/index are missing");
      }

      const [{ PineconeStore }, { Pinecone: PineconeClient }] = await Promise.all([
        import("@langchain/pinecone"),
        import("@pinecone-database/pinecone"),
      ]);

      const client = new PineconeClient({ apiKey: this.pineconeApiKey });
      const index = client.Index(this.pineconeIndex);

      this.store = await PineconeStore.fromDocuments(docs, this.embeddings, {
        pineconeIndex: index,
        namespace: this.namespace,
        textKey: "text",
      });
      return;
    }

    this.store = await MemoryVectorStore.fromDocuments(docs, this.embeddings);
  }

  async similaritySearch(question, topK = 5) {
    if (!this.store && this.provider === "pinecone") {
      await this.initPineconeStore();
    }
    if (!this.store) return [];

    const results = await this.store.similaritySearchWithScore(question, topK);
    return results.map(([doc, score]) => ({
      text: doc.pageContent,
      source: doc.metadata?.source || "unknown",
      id: doc.metadata?.id || null,
      score,
    }));
  }
}

export function createVectorStore(embeddings) {
  return new LangChainVectorStore(embeddings, {
    provider: env.vectorDbProvider,
    namespace: env.pineconeNamespace,
    pineconeApiKey: env.pineconeApiKey,
    pineconeIndex: env.pineconeIndex,
  });
}
