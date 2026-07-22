import type { FileNode } from "../../types";
import type { ChunkIndexSnapshot, TextChunk } from "../../types/vaultIndex";
import { flattenFiles, isMarkdownFile } from "../../utils/markdownLinkUtils";
import { chunkMarkdownFile } from "./chunkService";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function createEmptyChunkIndex(vaultRoot: string): ChunkIndexSnapshot {
  return {
    version: 1,
    vaultRoot: normalizePath(vaultRoot),
    builtAt: Date.now(),
    byPath: {},
  };
}

export function allChunksFromIndex(
  snapshot: ChunkIndexSnapshot | null,
): TextChunk[] {
  if (!snapshot) return [];
  return Object.values(snapshot.byPath).flat();
}

export async function buildFullChunkIndex(options: {
  files: FileNode[];
  vaultRoot: string;
  readFile: (path: string) => Promise<string>;
  onProgress?: (done: number, total: number, currentPath: string) => void;
  shouldCancel?: () => boolean;
}): Promise<ChunkIndexSnapshot> {
  const paths = flattenFiles(options.files)
    .filter(isMarkdownFile)
    .map((node) => normalizePath(node.path));
  const byPath: Record<string, TextChunk[]> = {};

  for (let index = 0; index < paths.length; index += 1) {
    if (options.shouldCancel?.()) break;
    const path = paths[index];
    options.onProgress?.(index, paths.length, path);
    try {
      const content = await options.readFile(path);
      byPath[path] = chunkMarkdownFile({
        path,
        vaultRoot: options.vaultRoot,
        content,
      });
    } catch {
      byPath[path] = [];
    }
  }

  options.onProgress?.(paths.length, paths.length, "");
  return {
    version: 1,
    vaultRoot: normalizePath(options.vaultRoot),
    builtAt: Date.now(),
    byPath,
  };
}

export async function upsertChunkPaths(options: {
  snapshot: ChunkIndexSnapshot;
  paths: string[];
  vaultRoot: string;
  readFile: (path: string) => Promise<string>;
  contentsByPath?: Record<string, string>;
}): Promise<ChunkIndexSnapshot> {
  const byPath = { ...options.snapshot.byPath };
  for (const rawPath of options.paths) {
    const path = normalizePath(rawPath);
    try {
      const content =
        options.contentsByPath?.[path] ??
        options.contentsByPath?.[rawPath] ??
        (await options.readFile(path));
      byPath[path] = chunkMarkdownFile({
        path,
        vaultRoot: options.vaultRoot,
        content,
      });
    } catch {
      byPath[path] = [];
    }
  }
  return {
    ...options.snapshot,
    vaultRoot: normalizePath(options.vaultRoot),
    builtAt: Date.now(),
    byPath,
  };
}

export function removeChunkPaths(
  snapshot: ChunkIndexSnapshot,
  paths: string[],
): ChunkIndexSnapshot {
  const byPath = { ...snapshot.byPath };
  for (const path of paths.map(normalizePath)) {
    delete byPath[path];
  }
  return {
    ...snapshot,
    builtAt: Date.now(),
    byPath,
  };
}
