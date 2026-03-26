import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { env } from "../../config/env.js";

function normalizeHost(host) {
  const raw = String(host || "").trim();
  if (!raw) return "";
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
}

function getPineconeIndex(client, indexName) {
  if (typeof client.index === "function") {
    return client.index(indexName);
  }
  if (typeof client.Index === "function") {
    return client.Index(indexName);
  }
  throw new Error("Unsupported Pinecone client version: index accessor not found");
}

export class LangChainVectorStore {
  constructor(embeddings, options = {}) {
    this.embeddings = embeddings;
    this.provider = options.provider || "local";
    this.namespace = options.namespace || "college-knowledge";
    this.pineconeApiKey = options.pineconeApiKey || "";
    this.pineconeIndex = options.pineconeIndex || "";
    this.pineconeIndexHost = normalizeHost(options.pineconeIndexHost || "");
    this.pineconeIntegratedEmbedding = Boolean(options.pineconeIntegratedEmbedding);
    this.pineconeEmbedField = options.pineconeEmbedField || "chunk_text";
    this.store = null;
    this.mode = this.provider === "pinecone" && this.pineconeIntegratedEmbedding
      ? "pinecone-integrated"
      : "local";
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
    const index = getPineconeIndex(client, this.pineconeIndex);

    this.store = await PineconeStore.fromExistingIndex(this.embeddings, {
      pineconeIndex: index,
      namespace: this.namespace,
      textKey: "pageContent",
    });
    this.mode = "pinecone-vector";
  }

  async pineconeRequest(pathname, payload) {
    if (!this.pineconeApiKey || !this.pineconeIndexHost) {
      throw new Error("Pinecone integrated embedding requires PINECONE_API_KEY and PINECONE_INDEX_HOST");
    }

    const response = await fetch(`${this.pineconeIndexHost}${pathname}`, {
      method: "POST",
      headers: {
        "Api-Key": this.pineconeApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Pinecone request failed (${response.status}): ${body.slice(0, 300)}`);
    }

    return response.json();
  }

  async buildWithIntegratedEmbedding(chunks) {
    if (!chunks.length) {
      this.mode = "pinecone-integrated";
      return;
    }

    const endpoint = `/records/namespaces/${encodeURIComponent(this.namespace)}/upsert`;
    const batchSize = 96;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const records = batch.map((chunk) => ({
        _id: String(chunk.id || `${chunk.source}-${i}`),
        source: String(chunk.source || "unknown"),
        id: String(chunk.id || ""),
        [this.pineconeEmbedField]: String(chunk.text || ""),
      }));
      await this.pineconeRequest(endpoint, { records });
    }

    this.mode = "pinecone-integrated";
  }

  async searchWithIntegratedEmbedding(question, topK = 5) {
    const endpoint = `/records/namespaces/${encodeURIComponent(this.namespace)}/search`;
    const payload = {
      query: {
        top_k: topK,
        inputs: {
          text: String(question || ""),
        },
      },
      fields: [this.pineconeEmbedField, "source", "id"],
    };
    const data = await this.pineconeRequest(endpoint, payload);
    const hits =
      data?.result?.hits ||
      data?.hits ||
      data?.matches ||
      [];

    return hits.map((hit) => {
      const fields = hit?.fields || hit?.metadata || {};
      return {
        text: String(fields?.[this.pineconeEmbedField] || hit?.[this.pineconeEmbedField] || ""),
        source: String(fields?.source || hit?.source || "unknown"),
        id: hit?._id || hit?.id || fields?.id || null,
        score: hit?._score ?? hit?.score ?? 0,
      };
    });
  }

  async buildFromChunks(chunks) {
    if (this.provider === "pinecone") {
      if (!this.pineconeApiKey || !this.pineconeIndex) {
        throw new Error("Pinecone provider selected but credentials/index are missing");
      }

      if (this.pineconeIntegratedEmbedding) {
        await this.buildWithIntegratedEmbedding(chunks);
        this.store = null;
        return;
      }

      const docs = this.toDocuments(chunks);
      const [{ PineconeStore }, { Pinecone: PineconeClient }] = await Promise.all([
        import("@langchain/pinecone"),
        import("@pinecone-database/pinecone"),
      ]);

      const client = new PineconeClient({ apiKey: this.pineconeApiKey });
      const index = getPineconeIndex(client, this.pineconeIndex);

      this.store = await PineconeStore.fromDocuments(docs, this.embeddings, {
        pineconeIndex: index,
        namespace: this.namespace,
        textKey: "pageContent",
      });
      this.mode = "pinecone-vector";
      return;
    }

    const docs = this.toDocuments(chunks);
    this.store = await MemoryVectorStore.fromDocuments(docs, this.embeddings);
    this.mode = "local";
  }

  async similaritySearch(question, topK = 5) {
    if (this.provider === "pinecone" && this.mode === "pinecone-integrated") {
      return this.searchWithIntegratedEmbedding(question, topK);
    }

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
    pineconeIndexHost: env.pineconeIndexHost,
    pineconeIntegratedEmbedding: env.pineconeIntegratedEmbedding,
    pineconeEmbedField: env.pineconeEmbedField,
  });
}
