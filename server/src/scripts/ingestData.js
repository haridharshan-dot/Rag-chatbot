import fs from "node:fs/promises";
import path from "node:path";
import { loadChunksFromDirectory } from "../services/rag/chunkService.js";
import { env } from "../config/env.js";
import { createVectorStore } from "../services/rag/vectorStore.js";
import { HashEmbeddings } from "../services/rag/embeddingService.js";

async function run() {
  console.log(`Ingesting data from ${env.dataDir}...`);
  const chunks = await loadChunksFromDirectory(env.dataDir);
  if (!chunks.length) {
    console.log(`No supported dataset files found in ${env.dataDir}`);
    return;
  }

  await fs.mkdir(path.dirname(env.chunksStorePath), { recursive: true });
  await fs.writeFile(
    env.chunksStorePath,
    JSON.stringify({ updatedAt: new Date().toISOString(), chunks }, null, 2),
    "utf8"
  );

  const vectorStore = createVectorStore(new HashEmbeddings({}));
  await vectorStore.buildFromChunks(chunks);

  console.log(
    `Ingested ${chunks.length} chunks to ${env.chunksStorePath} with provider ${env.vectorDbProvider}`
  );
}

run().catch((error) => {
  console.error("Ingestion failed", error);
  process.exit(1);
});
