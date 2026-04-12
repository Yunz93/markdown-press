import { useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { ViewMode } from '../types';

/**
 * Hook for view mode management
 *
 * Toggle cycle: EDITOR -> SPLIT -> PREVIEW -> SPLIT -> EDITOR
 * This creates a smooth loop: 1:0 -> 0.5:0.5 -> 0:1 -> 0.5:0.5 -> 1:0
 */
export function useViewMode() {
  const { viewMode, lastNonSplitViewMode, setViewMode } = useAppStore();

  const toggleViewMode = useCallback(() => {
    // Cycle: EDITOR -> SPLIT -> PREVIEW -> SPLIT -> EDITOR
    // From SPLIT, go to the opposite of lastNonSplitViewMode
    // From EDITOR or PREVIEW, always go to SPLIT
    if (viewMode === ViewMode.SPLIT) {
      const targetMode = lastNonSplitViewMode === ViewMode.EDITOR
        ? ViewMode.PREVIEW
        : ViewMode.EDITOR;
      setViewMode(targetMode, 'toggle');
    } else {
      setViewMode(ViewMode.SPLIT, 'toggle');
    }
  }, [viewMode, lastNonSplitViewMode, setViewMode]);

  const setEditorOnly = useCallback(() => {
    setViewMode(ViewMode.EDITOR, 'direct');
  }, [setViewMode]);

  const setPreviewOnly = useCallback(() => {
    setViewMode(ViewMode.PREVIEW, 'direct');
  }, [setViewMode]);

  const setSplitView = useCallback(() => {
    setViewMode(ViewMode.SPLIT, 'direct');
  }, [setViewMode]);

  return {
    viewMode,
    setViewMode,
    toggleViewMode,
    setEditorOnly,
    setPreviewOnly,
    setSplitView,
    isEditorOnly: viewMode === ViewMode.EDITOR,
    isPreviewOnly: viewMode === ViewMode.PREVIEW,
    isSplitView: viewMode === ViewMode.SPLIT,
  };
}
