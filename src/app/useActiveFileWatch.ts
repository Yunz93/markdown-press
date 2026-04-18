import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { findFileInTree } from './appShellUtils';
import type { FileNode } from '../types';
import type { FileWatchEvent } from '../types/filesystem';
import type { TranslationKey } from '../utils/i18n';

interface UseActiveFileWatchOptions {
  activeTabId: string | null;
  currentFilePath: string | null;
  files: FileNode[];
  readFile: (file: FileNode) => Promise<string>;
  setCurrentFilePath: (path: string | null) => void;
  showNotification: (message: string, type: 'success' | 'error') => void;
  watchFile: (path: string, callback: (event: FileWatchEvent | null) => void) => Promise<(() => void) | null>;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export function useActiveFileWatch(options: UseActiveFileWatchOptions): void {
  const {
    activeTabId,
    currentFilePath,
    files,
    readFile,
    setCurrentFilePath,
    showNotification,
    watchFile,
    t,
  } = options;

  useEffect(() => {
    const nextPath = activeTabId ? findFileInTree(files, activeTabId)?.path ?? null : null;
    if (currentFilePath !== nextPath) {
      setCurrentFilePath(nextPath);
    }
  }, [activeTabId, files, currentFilePath, setCurrentFilePath]);

  useEffect(() => {
    if (!activeTabId || !currentFilePath) return;

    let disposed = false;
    let unwatch: (() => void) | null = null;

    const setupWatcher = async () => {
      if (unwatch) {
        unwatch();
        unwatch = null;
      }

      unwatch = await watchFile(currentFilePath, async (event) => {
        if (disposed) return;
        if (event?.type === 'deleted') {
          showNotification(t('notifications_fileDeletedOnDisk'), 'error');
          return;
        }
        if (event?.type === 'error') {
          showNotification(t('notifications_watchFileFailed'), 'error');
          return;
        }
        if (event?.type !== 'modified') return;

        const state = useAppStore.getState();
        if (state.hasUnsavedChanges(activeTabId)) {
          showNotification(t('notifications_fileChangedOnDisk'), 'error');
          return;
        }

        const node = findFileInTree(state.files, activeTabId);
        if (!node || node.type !== 'file') return;

        try {
          const latestContent = await readFile(node);
          const currentCached = useAppStore.getState().fileContents[activeTabId];
          if (currentCached === latestContent) return;

          useAppStore.getState().updateTabContent(activeTabId, latestContent);
          showNotification(t('notifications_fileReloaded'), 'success');
        } catch (error) {
          console.error('Failed to reload file from disk:', error);
          showNotification(t('notifications_reloadFileFailed'), 'error');
        }
      });
    };

    void setupWatcher();

    return () => {
      disposed = true;
      if (unwatch) {
        unwatch();
        unwatch = null;
      }
    };
  }, [activeTabId, currentFilePath, readFile, showNotification, watchFile, t]);
}
