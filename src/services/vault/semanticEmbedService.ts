import type { AppSettings, FileNode } from "../../types";
import type { ChunkIndexSnapshot, TextChunk } from "../../types/vaultIndex";
import { createEmbeddingProvider } from "./embeddingProvider";
import { diffChunks } from "./chunkService";
import {
  CHUNK_INDEX_FILE,
  VECTOR_INDEX_FILE,
  writeIndexJson,
} from "./indexStorage";
import type { VectorStore, VectorStoreSnapshot } from "./vectorStore";

const EMBED_BATCH = 16;

export async function embedChunkIndex(options: {
  chunkIndex: ChunkIndexSnapshot;
  vectorStore: VectorStore;
  settings: AppSettings;
  previousByPath?: Record<string, TextChunk[]>;
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
}): Promise<void> {
  const provider = createEmbeddingProvider(options.settings);
  if (provider.id === "none") {
    options.vectorStore.load(null);
    return;
  }

  const model = options.settings.embeddingModel?.trim() || "nomic-embed-text";
  options.vectorStore.model = model;
  options.vectorStore.vaultRoot = options.chunkIndex.vaultRoot;

  const upsertChunks: TextChunk[] = [];
  const removeIds: string[] = [];

  for (const [path, chunks] of Object.entries(options.chunkIndex.byPath)) {
    const previous = options.previousByPath?.[path] ?? [];
    const diff = diffChunks(previous, chunks);
    upsertChunks.push(...diff.upsert);
    removeIds.push(...diff.removeIds);
    // Also embed chunks whose vectors are missing even if hash matches.
    for (const chunk of chunks) {
      const existing = options.vectorStore.get(chunk.id);
      if (!existing || existing.contentHash !== chunk.contentHash) {
        if (!upsertChunks.some((item) => item.id === chunk.id)) {
          upsertChunks.push(chunk);
        }
      }
    }
  }

  // Drop vectors for removed paths entirely.
  const currentIds = new Set(
    Object.values(options.chunkIndex.byPath)
      .flat()
      .map((chunk) => chunk.id),
  );
  for (const record of options.vectorStore.toSnapshot().records) {
    if (!currentIds.has(record.id)) {
      removeIds.push(record.id);
    }
  }

  if (removeIds.length > 0) {
    options.vectorStore.remove(removeIds);
  }

  for (let index = 0; index < upsertChunks.length; index += EMBED_BATCH) {
    if (options.shouldCancel?.()) return;
    const batch = upsertChunks.slice(index, index + EMBED_BATCH);
    options.onProgress?.(index, upsertChunks.length);
    const vectors = await provider.embed(batch.map((chunk) => chunk.text));
    options.vectorStore.upsert(
      batch.map((chunk, batchIndex) => ({
        id: chunk.id,
        contentHash: chunk.contentHash,
        values: vectors[batchIndex]!,
      })),
    );
  }
  options.onProgress?.(upsertChunks.length, upsertChunks.length);
  options.vectorStore.builtAt = Date.now();
}

export async function persistSemanticIndexes(options: {
  vaultRoot: string;
  chunkIndex: ChunkIndexSnapshot;
  vectorStore: VectorStore;
}): Promise<void> {
  await writeIndexJson(options.vaultRoot, CHUNK_INDEX_FILE, options.chunkIndex);
  if (options.vectorStore.size() > 0) {
    await writeIndexJson(
      options.vaultRoot,
      VECTOR_INDEX_FILE,
      options.vectorStore.toSnapshot(),
    );
  }
}

export async function loadVectorSnapshot(
  vaultRoot: string,
  read: <T>(vaultRoot: string, file: string) => Promise<T | null>,
): Promise<VectorStoreSnapshot | null> {
  return read<VectorStoreSnapshot>(vaultRoot, VECTOR_INDEX_FILE);
}

/** Helper kept for tree typing in callers. */
export type MarkdownTree = FileNode[];
