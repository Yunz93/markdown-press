/**
 * Hook for view mode management
 *
 * Toggle cycle: Source → Live Preview → Reading → Source
 */

import { useCallback } from "react";
import { useAppStore } from "../store/appStore";
import { ViewMode } from "../types";
import { getNextViewMode, normalizeSessionViewMode } from "../utils/viewMode";

export function useViewMode() {
  const { viewMode, setViewMode } = useAppStore();

  const toggleViewMode = useCallback(() => {
    setViewMode(getNextViewMode(viewMode), "toggle");
  }, [viewMode, setViewMode]);

  const setEditorOnly = useCallback(() => {
    setViewMode(ViewMode.EDITOR, "direct");
  }, [setViewMode]);

  const setLivePreview = useCallback(() => {
    setViewMode(ViewMode.LIVE, "direct");
  }, [setViewMode]);

  const setPreviewOnly = useCallback(() => {
    setViewMode(ViewMode.PREVIEW, "direct");
  }, [setViewMode]);

  const normalized = normalizeSessionViewMode(viewMode);

  return {
    viewMode: normalized,
    setViewMode,
    toggleViewMode,
    setEditorOnly,
    setLivePreview,
    setPreviewOnly,
    isEditorOnly: normalized === ViewMode.EDITOR,
    isLivePreview: normalized === ViewMode.LIVE,
    isPreviewOnly: normalized === ViewMode.PREVIEW,
  };
}
