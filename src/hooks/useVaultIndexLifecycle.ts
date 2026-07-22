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
import type { LinkIndexSnapshot } from "../types/vaultIndex";
import {
  LINK_INDEX_FILE,
  readIndexJson,
  writeIndexJson,
} from "../services/vault/indexStorage";
import {
  setVaultFileSavedHandler,
  setVaultRebuildHandler,
} from "../services/vault/linkIndexEvents";
import { buildFileTreeSignature } from "../utils/fileTree";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isValidSnapshot(
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

/**
 * Keeps the vault wiki link index in sync with open/save/tree changes.
 */
export function useVaultIndexLifecycle(): {
  rebuildLinkIndex: () => Promise<void>;
  invalidateFile: (path: string, content?: string) => Promise<void>;
} {
  const rootFolderPath = useAppStore((s) => s.rootFolderPath);
  const files = useAppStore((s) => s.files);
  const generationRef = useRef(0);
  const buildingRef = useRef(false);
  const prevPathsRef = useRef<string>("");

  const persistSnapshot = useCallback(async (snapshot: LinkIndexSnapshot) => {
    await writeIndexJson(snapshot.vaultRoot, LINK_INDEX_FILE, snapshot);
  }, []);

  const rebuildLinkIndex = useCallback(async () => {
    const state = useAppStore.getState();
    const vaultRoot = state.rootFolderPath;
    if (!vaultRoot) {
      state.setLinkIndex(null);
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
      await persistSnapshot(snapshot);
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
  }, [persistSnapshot]);

  const ensureIndex = useCallback(async () => {
    const state = useAppStore.getState();
    const vaultRoot = state.rootFolderPath;
    if (!vaultRoot) {
      state.setLinkIndex(null);
      return;
    }

    const cached = await readIndexJson<LinkIndexSnapshot>(
      vaultRoot,
      LINK_INDEX_FILE,
    );
    if (isValidSnapshot(cached, vaultRoot)) {
      const { toAdd, toRemove } = reconcileTreeWithIndex({
        snapshot: cached,
        files: state.files,
      });
      if (toAdd.length === 0 && toRemove.length === 0) {
        state.setLinkIndex(cached);
        prevPathsRef.current = buildFileTreeSignature(state.files);
        return;
      }
    }

    await rebuildLinkIndex();
  }, [rebuildLinkIndex]);

  const invalidateFile = useCallback(
    async (path: string, content?: string) => {
      const state = useAppStore.getState();
      const vaultRoot = state.rootFolderPath;
      const snapshot = state.linkIndex;
      if (!vaultRoot || !snapshot) return;

      try {
        const fs = await getFileSystem();
        const next = await reindexFileContents({
          snapshot,
          pathContents: {
            [path]:
              content ?? state.fileContents[path] ?? (await fs.readFile(path)),
          },
          files: state.files,
          vaultRoot,
        });
        state.setLinkIndex(next);
        void persistSnapshot(next);
      } catch (error) {
        console.warn("Failed to update link index for file:", path, error);
      }
    },
    [persistSnapshot],
  );

  // Register save-path invalidation for autosave / manual save.
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

  // Open / switch vault → ensure index
  useEffect(() => {
    generationRef.current += 1;
    if (!rootFolderPath) {
      useAppStore.getState().setLinkIndex(null);
      prevPathsRef.current = "";
      return;
    }
    void ensureIndex();
  }, [rootFolderPath, ensureIndex]);

  // Tree shape changes (watch / refresh) → reconcile
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
        void persistSnapshot(next);
      } catch (error) {
        console.warn("Failed to reconcile link index:", error);
      }
    };

    void run();
  }, [files, rootFolderPath, persistSnapshot]);

  return { rebuildLinkIndex, invalidateFile };
}
