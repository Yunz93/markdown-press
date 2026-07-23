import { useCallback } from "react";
import { useAppStore } from "../store/appStore";
import { ViewMode } from "../types";
import { getNextViewMode } from "../utils/viewMode";

/**
 * Hook for view mode management
 *
 * Toggle cycle: edit-solo (LIVE/EDITOR) -> SPLIT -> PREVIEW -> SPLIT -> LIVE
 */
export function useViewMode() {
  const { viewMode, lastNonSplitViewMode, setViewMode } = useAppStore();

  const toggleViewMode = useCallback(() => {
    setViewMode(getNextViewMode(viewMode, lastNonSplitViewMode), "toggle");
  }, [viewMode, lastNonSplitViewMode, setViewMode]);

  const setEditorOnly = useCallback(() => {
    setViewMode(ViewMode.EDITOR, "direct");
  }, [setViewMode]);

  const setLivePreview = useCallback(() => {
    setViewMode(ViewMode.LIVE, "direct");
  }, [setViewMode]);

  const setPreviewOnly = useCallback(() => {
    setViewMode(ViewMode.PREVIEW, "direct");
  }, [setViewMode]);

  const setSplitView = useCallback(() => {
    setViewMode(ViewMode.SPLIT, "direct");
  }, [setViewMode]);

  return {
    viewMode,
    setViewMode,
    toggleViewMode,
    setEditorOnly,
    setLivePreview,
    setPreviewOnly,
    setSplitView,
    isEditorOnly: viewMode === ViewMode.EDITOR,
    isLivePreview: viewMode === ViewMode.LIVE,
    isPreviewOnly: viewMode === ViewMode.PREVIEW,
    isSplitView: viewMode === ViewMode.SPLIT,
  };
}
