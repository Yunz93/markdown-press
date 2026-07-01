import { useEffect } from "react";
import { useAppStore } from "../store/appStore";
import {
  collectRemovedOpenTabIds,
  detectOpenTabPathRemaps,
} from "../utils/fileTree";
import {
  buildTabPathRemapState,
  migrateDraftBackupKeys,
} from "../utils/pathRemap";
import type { DirectoryWatchEvent } from "../types/filesystem";
import type { TranslationKey } from "../utils/i18n";

interface UseKnowledgeBaseWatchOptions {
  rootFolderPath: string | null;
  watchDirectory: (
    dirPath: string,
    callback: (event: DirectoryWatchEvent) => void,
  ) => Promise<(() => void) | null>;
  showNotification: (message: string, type: "success" | "error") => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export function useKnowledgeBaseWatch(
  options: UseKnowledgeBaseWatchOptions,
): void {
  const { rootFolderPath, watchDirectory, showNotification, t } = options;

  useEffect(() => {
    if (!rootFolderPath) return;

    let disposed = false;
    let unwatch: (() => void) | null = null;

    const setupWatcher = async () => {
      const watcher = await watchDirectory(rootFolderPath, (event) => {
        if (disposed) return;

        if (event.type === "error") {
          showNotification(t("notifications_watchDirectoryFailed"), "error");
          return;
        }

        const state = useAppStore.getState();
        const pathRemaps = detectOpenTabPathRemaps(
          state.files,
          event.tree,
          state.openTabs,
        );
        if (Object.keys(pathRemaps).length > 0) {
          useAppStore.setState((current) =>
            buildTabPathRemapState(current, pathRemaps),
          );
          migrateDraftBackupKeys(pathRemaps);
        }

        const latestState = useAppStore.getState();
        const removedTabIds = collectRemovedOpenTabIds(
          latestState.files,
          event.tree,
          latestState.openTabs,
        ).filter((tabId) => !pathRemaps[tabId]);

        latestState.setFiles(event.tree);

        if (removedTabIds.length === 0) {
          return;
        }

        const tabsWithUnsavedChanges: string[] = [];
        removedTabIds.forEach((tabId) => {
          const current = useAppStore.getState();
          if (current.hasUnsavedChanges(tabId)) {
            tabsWithUnsavedChanges.push(tabId);
            return;
          }
          current.closeTab(tabId);
        });

        if (tabsWithUnsavedChanges.length > 0) {
          showNotification(
            t("notifications_fileDeletedOnDiskUnsaved"),
            "error",
          );
          return;
        }

        showNotification(t("notifications_fileDeletedOnDisk"), "error");
      });

      if (disposed) {
        watcher?.();
        return;
      }

      unwatch = watcher;
    };

    void setupWatcher();

    return () => {
      disposed = true;
      if (unwatch) {
        unwatch();
        unwatch = null;
      }
    };
  }, [rootFolderPath, showNotification, t, watchDirectory]);
}
