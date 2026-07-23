/**
 * Hook for view mode management
 *
 * Toggle cycle: Live Preview ↔ Reading
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
    setLivePreview,
    setPreviewOnly,
    isLivePreview: normalized === ViewMode.LIVE,
    isPreviewOnly: normalized === ViewMode.PREVIEW,
  };
}
