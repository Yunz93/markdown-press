import { useCallback, useEffect } from 'react';
import { useAppStore } from '../store/appStore';

/**
 * Hook for undo/redo functionality
 * Integrates with the store's history state
 */
export function useUndoRedo() {
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    content,
    activeTabId
  } = useAppStore();

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMod = e.ctrlKey || e.metaKey;

    if (!isMod || !activeTabId) return;

    // Undo: Ctrl+Z or Cmd+Z (not Shift+Z for redo)
    if (e.key === 'z' && !e.shiftKey) {
      if (canUndo()) {
        e.preventDefault();
        undo();
      }
    }
    // Redo: Ctrl+Shift+Z or Cmd+Shift+Z, or Ctrl+Y
    else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
      if (canRedo()) {
        e.preventDefault();
        redo();
      }
    }
  }, [undo, redo, canUndo, canRedo, activeTabId]);

  // Set up global keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    canUndo: canUndo(),
    canRedo: canRedo(),
    undo,
    redo,
  };
}

/**
 * Hook for tracking content history stats
 */
export function useHistoryStats() {
  const { history, content } = useAppStore();

  return {
    pastLength: history.past.length,
    futureLength: history.future.length,
    maxHistory: history.maxHistory,
    currentContentLength: content.length,
  };
}