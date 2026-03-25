import fs from "node:fs/promises";
import path from "node:path";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

function normalizeText(content) {
  return content.replace(/\r\n/g, "\n").trim();
}

const IMPORTANT_KEYS = new Set([
  "college",
  "department",
  "branch",
  "program",
  "course",
  "category",
  "year",
  "cutoff",
  "tuition",
  "fees",
  "eligibility",
  "deadline",
  "hostel",
]);

async function chunkText(content, sourceName) {
  const clean = normalizeText(content);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 700,
    chunkOverlap: 120,
  });
  const segments = await splitter.splitText(clean);

  return segments.map((segment, index) => ({
    id: `${sourceName}-${index + 1}`,
    source: sourceName,
    text: segment,
  }));
}

function flattenJson(value, parentKey = "") {
  if (value === null || value === undefined) return [];

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [`${parentKey}: ${String(value)}`];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenJson(item, `${parentKey}[${index}]`));
  }

  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, val]) => {
      const nextKey = parentKey ? `${parentKey}.${key}` : key;
      return flattenJson(val, nextKey);
    });
  }

  return [];
}

function objectToRecordText(record, prefix = "") {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";

  const entries = Object.entries(record);
  const ordered = entries.sort(([a], [b]) => {
    const aImportant = IMPORTANT_KEYS.has(a.toLowerCase()) ? 0 : 1;
    const bImportant = IMPORTANT_KEYS.has(b.toLowerCase()) ? 0 : 1;
    if (aImportant !== bImportant) return aImportant - bImportant;
    return a.localeCompare(b);
  });

  const lines = ordered.map(([key, value]) => {
    if (value && typeof value === "object") {
      const nested = flattenJson(value, key);
      return nested.join("\n");
    }
    return `${key}: ${String(value)}`;
  });

  return prefix ? `${prefix}\n${lines.join("\n")}` : lines.join("\n");
}

function jsonToKnowledgeText(parsed) {
  if (Array.isArray(parsed)) {
    return parsed
      .map((item, index) => objectToRecordText(item, `record: ${index + 1}`))
      .filter(Boolean)
      .join("\n\n");
  }

  if (parsed && typeof parsed === "object") {
    const topLevelArrayKeys = Object.entries(parsed).filter(([, val]) => Array.isArray(val));
    if (topLevelArrayKeys.length) {
      return topLevelArrayKeys
        .map(([key, arr]) =>
          arr
            .map((item, index) =>
              objectToRecordText(item, `section: ${key}\nrecord: ${index + 1}`)
            )
            .filter(Boolean)
            .join("\n\n")
        )
        .filter(Boolean)
        .join("\n\n");
    }

    return objectToRecordText(parsed, "section: root");
  }

  return String(parsed);
}

async function walkFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkFiles(fullPath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function loadChunksFromDirectory(directoryPath) {
  const files = await walkFiles(directoryPath);
  const chunks = [];

  for (const fullPath of files) {
    const ext = path.extname(fullPath).toLowerCase();
    const sourceName = path.relative(directoryPath, fullPath);

    if (![".txt", ".md", ".json"].includes(ext)) continue;

    const content = await fs.readFile(fullPath, "utf8");

    let textContent = content;
    if (ext === ".json") {
      const parsed = JSON.parse(content);
      textContent = jsonToKnowledgeText(parsed);
    }

    const fileChunks = await chunkText(textContent, sourceName);
    chunks.push(...fileChunks);
  }

  return chunks;
}
