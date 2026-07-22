import type { AppSettings } from "../../types";
import type {
  AskVaultAnswer,
  AskVaultCitation,
  RetrieveOptions,
  TextChunk,
} from "../../types/vaultIndex";
import { ASK_VAULT_GEMINI_SCHEMA, buildAskVaultPrompt } from "../ai/prompts";
import { completeJsonWithProvider, ensureAIConfiguration } from "../aiService";
import { createEmbeddingProvider } from "./embeddingProvider";
import { retrieve } from "./retrieveService";
import {
  getActiveChunkIndex,
  getActiveVectorStore,
} from "./semanticIndexRuntime";
import { readIndexJson, writeIndexJson } from "./indexStorage";

export interface AskVaultRequest {
  question: string;
  settings: AppSettings;
  scope?: RetrieveOptions["scope"];
  folderPath?: string | null;
  filePaths?: string[];
  topK?: number;
}

interface AskVaultModelResponse {
  answerMarkdown?: string;
  citationIndexes?: number[];
}

const ASK_HISTORY_FILE = "ask-history.json";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function toCitations(
  chunks: TextChunk[],
  indexes: number[],
): AskVaultCitation[] {
  const byIndex = new Map(chunks.map((chunk, i) => [i + 1, chunk]));
  const unique = [...new Set(indexes.filter((n) => Number.isFinite(n)))];
  return unique
    .map((index) => {
      const chunk = byIndex.get(index);
      if (!chunk) return null;
      return {
        index,
        path: chunk.path,
        relPath: chunk.relPath,
        titlePath: chunk.titlePath,
        snippet: chunk.text.slice(0, 240),
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        headingAnchor: chunk.headingAnchor,
      } satisfies AskVaultCitation;
    })
    .filter((item): item is AskVaultCitation => item !== null);
}

export async function askVault(
  request: AskVaultRequest,
): Promise<AskVaultAnswer> {
  ensureAIConfiguration(request.settings);

  const chunkIndex = getActiveChunkIndex();
  const mode =
    (request.settings.embeddingProvider ?? "none") === "none"
      ? "keyword"
      : (request.settings.searchModeDefault ?? "hybrid");

  const hits = await retrieve({
    query: request.question,
    chunkIndex,
    vectorStore: getActiveVectorStore(),
    embeddingProvider: createEmbeddingProvider(request.settings),
    retrieve: {
      mode,
      scope: request.scope ?? "vault",
      folderPath: request.folderPath,
      filePaths: request.filePaths,
      topK: request.topK ?? 8,
    },
  });

  if (hits.length === 0) {
    return {
      answerMarkdown:
        request.settings.language === "en"
          ? "I could not find relevant notes in this knowledge base."
          : "知识库中未找到与问题相关的内容。",
      citations: [],
      usedChunkIds: [],
      model:
        request.settings.aiProvider === "codex"
          ? request.settings.codexModel || "codex"
          : request.settings.aiProvider === "deepseek"
            ? request.settings.deepseekModel || "deepseek"
            : request.settings.geminiModel || "gemini",
      retrievedAt: Date.now(),
    };
  }

  const promptChunks = hits.map((hit, index) => ({
    index: index + 1,
    path: hit.chunk.relPath || hit.chunk.path,
    titlePath: hit.chunk.titlePath,
    startLine: hit.chunk.startLine,
    endLine: hit.chunk.endLine,
    text: hit.chunk.text,
  }));

  const prompt = buildAskVaultPrompt(request.question, promptChunks);
  const raw = await completeJsonWithProvider<AskVaultModelResponse>(
    prompt,
    request.settings,
    ASK_VAULT_GEMINI_SCHEMA as unknown as Record<string, unknown>,
  );

  const citationIndexes =
    Array.isArray(raw.citationIndexes) && raw.citationIndexes.length > 0
      ? raw.citationIndexes
      : promptChunks.map((chunk) => chunk.index);

  const citations = toCitations(
    hits.map((hit) => hit.chunk),
    citationIndexes,
  );

  return {
    answerMarkdown:
      (raw.answerMarkdown || "").trim() ||
      (request.settings.language === "en"
        ? "No answer was generated."
        : "未能生成回答。"),
    citations,
    usedChunkIds: hits.map((hit) => hit.chunk.id),
    model:
      request.settings.aiProvider === "codex"
        ? request.settings.codexModel || "codex"
        : request.settings.aiProvider === "deepseek"
          ? request.settings.deepseekModel || "deepseek"
          : request.settings.geminiModel || "gemini",
    retrievedAt: Date.now(),
  };
}

export interface AskVaultHistoryItem {
  id: string;
  question: string;
  answer: AskVaultAnswer;
  at: number;
}

export async function appendAskVaultHistory(
  vaultRoot: string,
  item: AskVaultHistoryItem,
): Promise<void> {
  const existing =
    (await readIndexJson<AskVaultHistoryItem[]>(vaultRoot, ASK_HISTORY_FILE)) ??
    [];
  const next = [item, ...existing].slice(0, 50);
  await writeIndexJson(vaultRoot, ASK_HISTORY_FILE, next);
}

export async function loadAskVaultHistory(
  vaultRoot: string,
): Promise<AskVaultHistoryItem[]> {
  const existing = await readIndexJson<AskVaultHistoryItem[]>(
    vaultRoot,
    ASK_HISTORY_FILE,
  );
  return existing ?? [];
}

export function estimateLineOffset(
  content: string,
  lineNumber: number,
): number {
  if (lineNumber <= 1) return 0;
  const lines = content.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < Math.min(lines.length, lineNumber - 1); i += 1) {
    offset += lines[i]!.length + 1;
  }
  return offset;
}

export function normalizeAskVaultPath(path: string): string {
  return normalizePath(path);
}
