import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { getFileSystem } from "../types/filesystem";
import {
  buildFullLinkIndex,
  reconcileTreeWithIndex,
  reindexFileContents,
  removeFilesFromIndex,
  updateFilesInIndex,
} from "../services/vault/linkIndexService";
import type {
  ChunkIndexSnapshot,
  LinkIndexSnapshot,
} from "../types/vaultIndex";
import {
  CHUNK_INDEX_FILE,
  LINK_INDEX_FILE,
  VECTOR_INDEX_FILE,
  readIndexJson,
  writeIndexJson,
} from "../services/vault/indexStorage";
import {
  setVaultFileSavedHandler,
  setVaultRebuildHandler,
} from "../services/vault/linkIndexEvents";
import { buildFileTreeSignature } from "../utils/fileTree";
import {
  buildFullChunkIndex,
  removeChunkPaths,
  upsertChunkPaths,
} from "../services/vault/chunkIndexService";
import {
  clearSemanticRuntime,
  ensureActiveVectorStore,
  getActiveChunkIndex,
  setActiveChunkIndex,
} from "../services/vault/semanticIndexRuntime";
import { embedChunkIndex } from "../services/vault/semanticEmbedService";
import type { VectorStoreSnapshot } from "../services/vault/vectorStore";
import { invalidateLivePreviewWikiCachesForPath } from "../components/editor/livePreview/wiki";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isValidLinkSnapshot(
  value: LinkIndexSnapshot | null,
  vaultRoot: string,
): value is LinkIndexSnapshot {
  return (
    !!value &&
    value.version === 1 &&
    normalizePath(value.vaultRoot) === normalizePath(vaultRoot) &&
    typeof value.outbounds === "object" &&
    value.outbounds !== null
  );
}

function isValidChunkSnapshot(
  value: ChunkIndexSnapshot | null,
  vaultRoot: string,
): value is ChunkIndexSnapshot {
  return (
    !!value &&
    value.version === 1 &&
    normalizePath(value.vaultRoot) === normalizePath(vaultRoot) &&
    typeof value.byPath === "object" &&
    value.byPath !== null
  );
}

/**
 * Keeps vault link + chunk (+ optional embedding) indexes in sync.
 */
export function useVaultIndexLifecycle(): {
  rebuildLinkIndex: () => Promise<void>;
  invalidateFile: (path: string, content?: string) => Promise<void>;
} {
  const rootFolderPath = useAppStore((s) => s.rootFolderPath);
  const files = useAppStore((s) => s.files);
  const embeddingProvider = useAppStore(
    (s) => s.settings.embeddingProvider ?? "builtin",
  );
  const generationRef = useRef(0);
  const buildingRef = useRef(false);
  const semanticEmbedGenerationRef = useRef(0);
  const prevPathsRef = useRef<string>("");

  const syncSemanticStatus = useCallback((vectorCount: number) => {
    useAppStore.getState().setSemanticStatus(vectorCount > 0, vectorCount);
  }, []);

  const refreshSemanticForChunkIndex = useCallback(
    async (
      chunkIndex: ChunkIndexSnapshot,
      options?: {
        previousByPath?: ChunkIndexSnapshot["byPath"];
        /** When set, abort if vault generation moved on (rebuild / vault switch). */
        linkGeneration?: number;
      },
    ) => {
      const embedGeneration = ++semanticEmbedGenerationRef.current;
      const state = useAppStore.getState();
      const vaultRoot = chunkIndex.vaultRoot;
      const isCurrent = () =>
        embedGeneration === semanticEmbedGenerationRef.current &&
        (options?.linkGeneration == null ||
          options.linkGeneration === generationRef.current) &&
        normalizePath(useAppStore.getState().rootFolderPath ?? "") ===
          normalizePath(vaultRoot);

      state.setChunkIndex(chunkIndex);
      setActiveChunkIndex(chunkIndex);
      await writeIndexJson(vaultRoot, CHUNK_INDEX_FILE, chunkIndex);
      if (!isCurrent()) return;

      const provider = state.settings.embeddingProvider ?? "builtin";
      const store = ensureActiveVectorStore(vaultRoot);
      if (provider === "none") {
        store.load(null);
        if (isCurrent()) syncSemanticStatus(0);
        return;
      }

      try {
        await embedChunkIndex({
          chunkIndex,
          vectorStore: store,
          settings: state.settings,
          previousByPath: options?.previousByPath,
          shouldCancel: () => !isCurrent(),
        });
        if (!isCurrent()) return;
        if (store.size() > 0) {
          await writeIndexJson(
            vaultRoot,
            VECTOR_INDEX_FILE,
            store.toSnapshot(),
          );
        }
        if (isCurrent()) syncSemanticStatus(store.size());
      } catch (error) {
        if (!isCurrent()) return;
        console.warn("Failed to embed chunk index:", error);
        syncSemanticStatus(store.size());
      }
    },
    [syncSemanticStatus],
  );

  const rebuildLinkIndex = useCallback(async () => {
    const state = useAppStore.getState();
    const vaultRoot = state.rootFolderPath;
    if (!vaultRoot) {
      state.setLinkIndex(null);
      state.setChunkIndex(null);
      state.setSemanticStatus(false, 0);
      clearSemanticRuntime();
      return;
    }

    const generation = ++generationRef.current;
    buildingRef.current = true;
    state.setLinkIndexProgress({
      phase: "building",
      done: 0,
      total: 0,
      currentPath: null,
      error: null,
    });

    try {
      const fs = await getFileSystem();
      const previousChunks = getActiveChunkIndex()?.byPath;
      const snapshot = await buildFullLinkIndex({
        files: state.files,
        vaultRoot,
        readFile: (path) => fs.readFile(path),
        onProgress: (done, total, currentPath) => {
          if (generation !== generationRef.current) return;
          useAppStore.getState().setLinkIndexProgress({
            phase: "building",
            done,
            total,
            currentPath: currentPath || null,
            error: null,
          });
        },
        shouldCancel: () => generation !== generationRef.current,
      });

      if (generation !== generationRef.current) return;
      state.setLinkIndex(snapshot);
      await writeIndexJson(snapshot.vaultRoot, LINK_INDEX_FILE, snapshot);

      const chunkIndex = await buildFullChunkIndex({
        files: state.files,
        vaultRoot,
        readFile: (path) => fs.readFile(path),
        shouldCancel: () => generation !== generationRef.current,
      });
      if (generation !== generationRef.current) return;
      await refreshSemanticForChunkIndex(chunkIndex, {
        previousByPath: previousChunks,
        linkGeneration: generation,
      });

      prevPathsRef.current = buildFileTreeSignature(state.files);
    } catch (error) {
      if (generation !== generationRef.current) return;
      useAppStore.getState().setLinkIndexProgress({
        phase: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (generation === generationRef.current) {
        buildingRef.current = false;
      }
    }
  }, [refreshSemanticForChunkIndex]);

  const ensureIndex = useCallback(async () => {
    const state = useAppStore.getState();
    const vaultRoot = state.rootFolderPath;
    if (!vaultRoot) {
      state.setLinkIndex(null);
      state.setChunkIndex(null);
      state.setSemanticStatus(false, 0);
      clearSemanticRuntime();
      return;
    }

    const cached = await readIndexJson<LinkIndexSnapshot>(
      vaultRoot,
      LINK_INDEX_FILE,
    );
    const cachedChunks = await readIndexJson<ChunkIndexSnapshot>(
      vaultRoot,
      CHUNK_INDEX_FILE,
    );
    const cachedVectors = await readIndexJson<VectorStoreSnapshot>(
      vaultRoot,
      VECTOR_INDEX_FILE,
    );

    if (isValidLinkSnapshot(cached, vaultRoot)) {
      const { toAdd, toRemove } = reconcileTreeWithIndex({
        snapshot: cached,
        files: state.files,
      });
      if (toAdd.length === 0 && toRemove.length === 0) {
        state.setLinkIndex(cached);
        prevPathsRef.current = buildFileTreeSignature(state.files);

        if (isValidChunkSnapshot(cachedChunks, vaultRoot)) {
          state.setChunkIndex(cachedChunks);
          setActiveChunkIndex(cachedChunks);
          const store = ensureActiveVectorStore(vaultRoot);
          store.load(cachedVectors);
          syncSemanticStatus(store.size());
          return;
        }

        const fs = await getFileSystem();
        const chunkIndex = await buildFullChunkIndex({
          files: state.files,
          vaultRoot,
          readFile: (path) => fs.readFile(path),
        });
        await refreshSemanticForChunkIndex(chunkIndex);
        return;
      }
    }

    await rebuildLinkIndex();
  }, [rebuildLinkIndex, refreshSemanticForChunkIndex, syncSemanticStatus]);

  const invalidateFile = useCallback(
    async (path: string, content?: string) => {
      const state = useAppStore.getState();
      const vaultRoot = state.rootFolderPath;
      const snapshot = state.linkIndex;
      if (!vaultRoot || !snapshot) return;

      try {
        const fs = await getFileSystem();
        const fileContent =
          content ?? state.fileContents[path] ?? (await fs.readFile(path));
        const next = await reindexFileContents({
          snapshot,
          pathContents: { [path]: fileContent },
          files: state.files,
          vaultRoot,
        });
        state.setLinkIndex(next);
        void writeIndexJson(vaultRoot, LINK_INDEX_FILE, next);

        const previousChunks = state.chunkIndex;
        const baseChunks =
          previousChunks ??
          createEmptyChunkFallback(vaultRoot, state.chunkIndex);
        const nextChunks = await upsertChunkPaths({
          snapshot: baseChunks,
          paths: [path],
          vaultRoot,
          readFile: async () => fileContent,
          contentsByPath: { [path]: fileContent },
        });
        await refreshSemanticForChunkIndex(nextChunks, {
          previousByPath: previousChunks?.byPath,
        });
        invalidateLivePreviewWikiCachesForPath(path);
      } catch (error) {
        console.warn("Failed to update link index for file:", path, error);
      }
    },
    [refreshSemanticForChunkIndex],
  );

  useEffect(() => {
    setVaultFileSavedHandler((path, content) => {
      void invalidateFile(path, content);
    });
    return () => setVaultFileSavedHandler(null);
  }, [invalidateFile]);

  useEffect(() => {
    setVaultRebuildHandler(rebuildLinkIndex);
    return () => setVaultRebuildHandler(null);
  }, [rebuildLinkIndex]);

  useEffect(() => {
    // Bump embed generation so in-flight jobs cannot write status for the old vault.
    semanticEmbedGenerationRef.current += 1;
    generationRef.current += 1;
    if (!rootFolderPath) {
      const state = useAppStore.getState();
      state.setLinkIndex(null);
      state.setChunkIndex(null);
      state.setSemanticStatus(false, 0);
      clearSemanticRuntime();
      prevPathsRef.current = "";
      return;
    }
    void ensureIndex();
  }, [rootFolderPath, ensureIndex]);

  // Re-embed when provider toggles after an index already exists.
  const prevEmbeddingProviderRef = useRef(embeddingProvider);
  useEffect(() => {
    if (prevEmbeddingProviderRef.current === embeddingProvider) return;
    prevEmbeddingProviderRef.current = embeddingProvider;
    const state = useAppStore.getState();
    const chunkIndex = state.chunkIndex;
    if (!state.rootFolderPath || !chunkIndex) return;
    void refreshSemanticForChunkIndex(chunkIndex, {
      previousByPath: chunkIndex.byPath,
    });
  }, [embeddingProvider, refreshSemanticForChunkIndex]);

  useEffect(() => {
    if (!rootFolderPath) return;
    const signature = buildFileTreeSignature(files);
    if (!prevPathsRef.current) {
      prevPathsRef.current = signature;
      return;
    }
    if (signature === prevPathsRef.current) return;
    prevPathsRef.current = signature;

    const run = async () => {
      const state = useAppStore.getState();
      const snapshot = state.linkIndex;
      if (!snapshot || buildingRef.current) return;

      const { toAdd, toRemove } = reconcileTreeWithIndex({
        snapshot,
        files: state.files,
      });
      if (toAdd.length === 0 && toRemove.length === 0) return;

      state.setLinkIndexProgress({
        phase: "updating",
        done: 0,
        total: toAdd.length,
        currentPath: null,
        error: null,
      });

      try {
        let next = snapshot;
        if (toRemove.length > 0) {
          next = removeFilesFromIndex(next, toRemove);
        }
        if (toAdd.length > 0 || toRemove.length > 0) {
          const fs = await getFileSystem();
          next = await updateFilesInIndex({
            snapshot: next,
            paths: toAdd,
            files: state.files,
            vaultRoot: rootFolderPath,
            readFile: (path) => fs.readFile(path),
            reresolveAll: true,
          });
        }

        useAppStore.getState().setLinkIndex(next);
        void writeIndexJson(rootFolderPath, LINK_INDEX_FILE, next);

        let chunkIndex =
          state.chunkIndex ??
          createEmptyChunkFallback(rootFolderPath, state.chunkIndex);
        const previousByPath = chunkIndex.byPath;
        if (toRemove.length > 0) {
          chunkIndex = removeChunkPaths(chunkIndex, toRemove);
        }
        if (toAdd.length > 0) {
          const fs = await getFileSystem();
          chunkIndex = await upsertChunkPaths({
            snapshot: chunkIndex,
            paths: toAdd,
            vaultRoot: rootFolderPath,
            readFile: (path) => fs.readFile(path),
          });
        }
        await refreshSemanticForChunkIndex(chunkIndex, { previousByPath });
      } catch (error) {
        console.warn("Failed to reconcile link index:", error);
      }
    };

    void run();
  }, [files, rootFolderPath, refreshSemanticForChunkIndex]);

  return { rebuildLinkIndex, invalidateFile };
}

function createEmptyChunkFallback(
  vaultRoot: string,
  existing: ChunkIndexSnapshot | null,
): ChunkIndexSnapshot {
  return (
    existing ?? {
      version: 1,
      vaultRoot: vaultRoot.replace(/\\/g, "/"),
      builtAt: Date.now(),
      byPath: {},
    }
  );
}
