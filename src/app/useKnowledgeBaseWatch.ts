import { useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { collectRemovedOpenTabIds } from "../utils/fileTree";
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
        const removedTabIds = collectRemovedOpenTabIds(
          state.files,
          event.tree,
          state.openTabs,
        );

        state.setFiles(event.tree);

        if (removedTabIds.length > 0) {
          removedTabIds.forEach((tabId) => state.closeTab(tabId));
          showNotification(t("notifications_fileDeletedOnDisk"), "error");
        }
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
