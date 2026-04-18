import { useCallback, useEffect } from 'react';
import { findUnusedAttachments } from '../utils/attachmentCleanup';
import type { FileNode } from '../types';
import type { TranslationKey } from '../utils/i18n';

interface UseAttachmentCleanupOptions {
  closeTab: (tabId: string) => void;
  fileContents: Record<string, string>;
  files: FileNode[];
  moveToTrash: (file: FileNode, options?: { silent?: boolean; skipRefresh?: boolean }) => Promise<string | null>;
  openTabs: string[];
  refreshFileTree: () => Promise<void>;
  rootFolderPath: string | null;
  resourceFolder: string;
  showNotification: (message: string, type: 'success' | 'error') => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export function useAttachmentCleanup(options: UseAttachmentCleanupOptions) {
  const {
    closeTab,
    fileContents,
    files,
    moveToTrash,
    openTabs,
    refreshFileTree,
    rootFolderPath,
    resourceFolder,
    showNotification,
    t,
  } = options;

  const handleCleanupUnusedAttachments = useCallback(async () => {
    if (!rootFolderPath) {
      showNotification(t('notifications_noKnowledgeBaseOpened'), 'error');
      return;
    }

    try {
      const scanResult = await findUnusedAttachments({
        files,
        rootFolderPath,
        resourceFolder,
        fileContentOverrides: fileContents,
      });

      if (scanResult.unusedAttachments.length === 0) {
        showNotification(t('notifications_noUnusedAttachmentsFound'), 'success');
        return;
      }

      const unusedPaths = new Set(scanResult.unusedAttachments.map((file) => file.path));
      let movedCount = 0;

      for (const attachment of scanResult.unusedAttachments) {
        const movedPath = await moveToTrash(attachment, {
          silent: true,
          skipRefresh: true,
        });

        if (movedPath) {
          movedCount += 1;
        } else {
          console.error('Failed to move unused attachment to trash:', attachment.path);
        }
      }

      if (movedCount > 0) {
        openTabs
          .filter((tabId) => unusedPaths.has(tabId))
          .forEach((tabId) => closeTab(tabId));
        await refreshFileTree();
      }

      if (movedCount === scanResult.unusedAttachments.length) {
        showNotification(
          t('notifications_unusedAttachmentsRemoved', { count: movedCount }),
          'success'
        );
        return;
      }

      if (movedCount > 0) {
        showNotification(
          t('notifications_unusedAttachmentsPartiallyRemoved', {
            deleted: movedCount,
            failed: scanResult.unusedAttachments.length - movedCount,
          }),
          'error'
        );
        return;
      }

      showNotification(t('notifications_removeUnusedAttachmentsFailed'), 'error');
    } catch (error) {
      console.error('Failed to cleanup unused attachments:', error);
      showNotification(t('notifications_removeUnusedAttachmentsFailed'), 'error');
    }
  }, [
    closeTab,
    fileContents,
    files,
    moveToTrash,
    openTabs,
    refreshFileTree,
    resourceFolder,
    rootFolderPath,
    showNotification,
    t,
  ]);

  useEffect(() => {
    const handleCleanupShortcut = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== 'Minus') return;
      if (!event.metaKey || !event.shiftKey || event.ctrlKey || event.altKey) return;

      event.preventDefault();
      void handleCleanupUnusedAttachments();
    };

    window.addEventListener('keydown', handleCleanupShortcut, true);
    return () => window.removeEventListener('keydown', handleCleanupShortcut, true);
  }, [handleCleanupUnusedAttachments]);

  return { handleCleanupUnusedAttachments };
}
