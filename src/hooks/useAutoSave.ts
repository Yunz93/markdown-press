import { useEffect, useCallback, useRef } from 'react';
import { useAppStore, selectContent } from '../store/appStore';
import { getFileSystem } from '../types/filesystem';
import { withErrorHandling, FileSystemError } from '../utils/errorHandler';

interface UseAutoSaveOptions {
  debounceMs?: number;
  enabled?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: Date | null;
  error: string | null;
  retryCount: number;
}

/**
 * Hook for auto-saving content with debounce, change detection, and retry logic
 */
export function useAutoSave(options: UseAutoSaveOptions = {}) {
  const {
    debounceMs,
    enabled = true,
    maxRetries = 3,
    retryDelayMs = 1000
  } = options;

  const content = useAppStore(selectContent);
  const {
    activeTabId,
    currentFilePath,
    isSaving,
    setSaving,
    updateFileContent,
    markAsSaved,
    showNotification,
    settings
  } = useAppStore();

  // Use configured auto-save interval or override from options
  const effectiveDebounceMs = debounceMs ?? settings?.autoSaveInterval ?? 60000;

  const contentRef = useRef(content);
  const pathRef = useRef(currentFilePath);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const saveStateRef = useRef<SaveState>({
    status: 'idle',
    lastSavedAt: null,
    error: null,
    retryCount: 0,
  });
  const lastSavedContentRef = useRef<string>('');
  const isSavingRef = useRef(false);

  // Keep refs updated
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    pathRef.current = currentFilePath;
  }, [currentFilePath]);

  // Reset save state when file changes
  useEffect(() => {
    lastSavedContentRef.current = content;
    saveStateRef.current = {
      status: 'idle',
      lastSavedAt: null,
      error: null,
      retryCount: 0,
    };
  }, [activeTabId]);

  // Execute save operation with retry logic
  const executeSave = useCallback(async (retryCount = 0): Promise<boolean> => {
    const currentContent = contentRef.current;
    const currentPath = pathRef.current;

    if (!currentPath || !activeTabId) return false;

    // Check if content has changed
    if (currentContent === lastSavedContentRef.current) {
      return true; // No changes to save
    }

    // Prevent concurrent saves
    if (isSavingRef.current) {
      return false;
    }

    isSavingRef.current = true;
    setSaving(true);
    saveStateRef.current.status = 'saving';

    try {
      await withErrorHandling(
        async () => {
          const fs = await getFileSystem();
          await fs.writeFile(currentPath, currentContent);
        },
        'Auto-save failed'
      );

      updateFileContent(activeTabId, currentContent);
      markAsSaved(activeTabId);
      lastSavedContentRef.current = currentContent;
      saveStateRef.current = {
        status: 'saved',
        lastSavedAt: new Date(),
        error: null,
        retryCount: 0,
      };
      isSavingRef.current = false;
      setSaving(false);
      return true;
    } catch (error) {
      console.error(`Auto-save failed (attempt ${retryCount + 1}):`, error);

      // Check if we should retry
      if (retryCount < maxRetries) {
        saveStateRef.current.retryCount = retryCount + 1;

        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * Math.pow(2, retryCount)));

        isSavingRef.current = false;
        return executeSave(retryCount + 1);
      }

      // Max retries exceeded
      const errorMessage = error instanceof FileSystemError
        ? error.toUserMessage()
        : (error instanceof Error ? error.message : 'Save failed');

      saveStateRef.current = {
        status: 'error',
        lastSavedAt: saveStateRef.current.lastSavedAt,
        error: errorMessage,
        retryCount: retryCount + 1,
      };
      isSavingRef.current = false;
      setSaving(false);

      // Save to local storage as backup
      try {
        localStorage.setItem(`draft_${activeTabId}`, currentContent);
        showNotification(
          `Failed to save to disk. Draft backed up locally.`,
          'error'
        );
      } catch (backupError) {
        showNotification(
          `Failed to save: ${saveStateRef.current.error}`,
          'error'
        );
      }

      return false;
    }
  }, [activeTabId, setSaving, updateFileContent, markAsSaved, showNotification, maxRetries, retryDelayMs]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!enabled || !activeTabId || !currentFilePath) return;

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(() => {
      executeSave();
    }, effectiveDebounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [content, enabled, activeTabId, currentFilePath, effectiveDebounceMs, executeSave]);

  // Force save function (for manual save)
  const forceSave = useCallback(async (contentOverride?: string): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (contentOverride !== undefined) {
      contentRef.current = contentOverride;
    }

    return executeSave();
  }, [executeSave]);

  // Get save state
  const getSaveState = useCallback((): SaveState => ({ ...saveStateRef.current }), []);

  // Restore draft from local storage
  const restoreDraft = useCallback((fileId: string): string | null => {
    try {
      const draft = localStorage.getItem(`draft_${fileId}`);
      return draft;
    } catch {
      return null;
    }
  }, []);

  // Clear draft from local storage
  const clearDraft = useCallback((fileId: string): void => {
    try {
      localStorage.removeItem(`draft_${fileId}`);
    } catch {
      // Ignore errors
    }
  }, []);

  return {
    isSaving,
    forceSave,
    getSaveState,
    restoreDraft,
    clearDraft,
  };
}
