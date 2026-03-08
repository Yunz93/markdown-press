import { useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { ViewMode } from '../types';

/**
 * Hook for view mode management
 */
export function useViewMode() {
  const { viewMode, setViewMode } = useAppStore();

  const toggleViewMode = useCallback(() => {
    setViewMode(viewMode === ViewMode.PREVIEW ? ViewMode.EDITOR :
                viewMode === ViewMode.EDITOR ? ViewMode.SPLIT : ViewMode.PREVIEW);
  }, [viewMode, setViewMode]);

  const setEditorOnly = useCallback(() => {
    setViewMode(ViewMode.EDITOR);
  }, [setViewMode]);

  const setPreviewOnly = useCallback(() => {
    setViewMode(ViewMode.PREVIEW);
  }, [setViewMode]);

  const setSplitView = useCallback(() => {
    setViewMode(ViewMode.SPLIT);
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
