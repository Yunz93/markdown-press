import { useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { findFileInTree } from "./appShellUtils";
import type { FileNode } from "../types";
import type { FileWatchEvent } from "../types/filesystem";
import type { TranslationKey } from "../utils/i18n";
import { isMarkdownFile, isPreviewOnlyFile } from "../utils/fileTypes";

interface UseActiveFileWatchOptions {
  activeTabId: string | null;
  currentFilePath: string | null;
  openTabs: string[];
  files: FileNode[];
  readFile: (file: FileNode) => Promise<string>;
  setCurrentFilePath: (path: string | null) => void;
  showNotification: (message: string, type: "success" | "error") => void;
  closeTab: (fileId: string) => void;
  refreshFileTree: () => Promise<void>;
  watchFile: (
    path: string,
    callback: (event: FileWatchEvent | null) => void,
  ) => Promise<(() => void) | null>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

function shouldWatchTabContent(node: FileNode | undefined): boolean {
  if (!node || node.type !== "file") return false;
  return isMarkdownFile(node.name) || isPreviewOnlyFile(node.name);
}

async function reloadTabFromDisk(
  tabId: string,
  readFile: (file: FileNode) => Promise<string>,
  showNotification: (message: string, type: "success" | "error") => void,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  options?: { notifyReload?: boolean },
): Promise<void> {
  const state = useAppStore.getState();
  if (state.hasUnsavedChanges(tabId)) {
    showNotification(t("notifications_fileChangedOnDisk"), "error");
    return;
  }

  const node = findFileInTree(state.files, tabId);
  if (!node || node.type !== "file") return;

  try {
    const latestContent = await readFile(node);
    const stateAfterRead = useAppStore.getState();

    if (stateAfterRead.hasUnsavedChanges(tabId)) {
      showNotification(t("notifications_fileChangedOnDisk"), "error");
      return;
    }

    const currentCached = stateAfterRead.fileContents[tabId];
    if (currentCached === latestContent) return;

    const stateBeforeUpdate = useAppStore.getState();
    if (stateBeforeUpdate.hasUnsavedChanges(tabId)) {
      showNotification(t("notifications_fileChangedOnDisk"), "error");
      return;
    }

    // Only reload tabs that already have content cached (opened).
    if (stateBeforeUpdate.fileContents[tabId] === undefined) return;

    stateBeforeUpdate.setContentForFile(tabId, latestContent, true);
    stateBeforeUpdate.markAsSaved(tabId);
    if (options?.notifyReload !== false) {
      showNotification(t("notifications_fileReloaded"), "success");
    }
  } catch (error) {
    console.error("Failed to reload file from disk:", error);
    showNotification(t("notifications_reloadFileFailed"), "error");
  }
}

export function useActiveFileWatch(options: UseActiveFileWatchOptions): void {
  const {
    activeTabId,
    currentFilePath,
    openTabs,
    files,
    readFile,
    setCurrentFilePath,
    showNotification,
    closeTab,
    refreshFileTree,
    watchFile,
    t,
  } = options;

  useEffect(() => {
    const nextPath = activeTabId
      ? (findFileInTree(files, activeTabId)?.path ?? null)
      : null;
    if (currentFilePath !== nextPath) {
      setCurrentFilePath(nextPath);
    }
  }, [activeTabId, files, currentFilePath, setCurrentFilePath]);

  // Watch every open tab so inactive tabs also pick up external edits/deletes.
  const openTabsKey = openTabs.join("\0");
  const watchersRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    let disposed = false;

    const stopWatching = (tabId: string) => {
      const unwatch = watchersRef.current.get(tabId);
      if (unwatch) {
        unwatch();
        watchersRef.current.delete(tabId);
      }
    };

    const setupWatcherForTab = async (tabId: string) => {
      const node = findFileInTree(files, tabId);
      if (!shouldWatchTabContent(node) || !node) {
        stopWatching(tabId);
        return;
      }

      // Replace existing watcher for this tab (path may have changed).
      stopWatching(tabId);

      const watcher = await watchFile(node.path, async (event) => {
        if (disposed) return;
        if (event?.type === "deleted") {
          const state = useAppStore.getState();
          if (state.hasUnsavedChanges(tabId)) {
            showNotification(
              t("notifications_fileDeletedOnDiskUnsaved"),
              "error",
            );
            void refreshFileTree();
            return;
          }
          closeTab(tabId);
          void refreshFileTree();
          showNotification(t("notifications_fileDeletedOnDisk"), "error");
          return;
        }
        if (event?.type === "error") {
          showNotification(t("notifications_watchFileFailed"), "error");
          return;
        }
        if (event?.type !== "modified") return;

        await reloadTabFromDisk(tabId, readFile, showNotification, t, {
          // Avoid toast spam when many background tabs reload at once;
          // always notify for the active tab.
          notifyReload: tabId === useAppStore.getState().activeTabId,
        });
      });

      if (disposed) {
        watcher?.();
        return;
      }

      if (watcher) {
        watchersRef.current.set(tabId, watcher);
      }
    };

    const desired = new Set(openTabs);
    for (const tabId of [...watchersRef.current.keys()]) {
      if (!desired.has(tabId)) {
        stopWatching(tabId);
      }
    }

    for (const tabId of openTabs) {
      void setupWatcherForTab(tabId);
    }

    return () => {
      disposed = true;
      for (const tabId of [...watchersRef.current.keys()]) {
        stopWatching(tabId);
      }
    };
    // files is used for path resolution; openTabsKey tracks membership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    openTabsKey,
    files,
    closeTab,
    readFile,
    refreshFileTree,
    showNotification,
    watchFile,
    t,
  ]);
}
