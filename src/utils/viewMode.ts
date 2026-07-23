import { ViewMode } from "../types";

/** Solo editing surfaces (no HTML preview pane). */
export function isEditorSoloMode(mode: ViewMode): boolean {
  return mode === ViewMode.EDITOR || mode === ViewMode.LIVE;
}

/** Any mode where the CodeMirror editor pane is visible. */
export function isEditorVisibleMode(mode: ViewMode): boolean {
  return isEditorSoloMode(mode) || mode === ViewMode.SPLIT;
}

/** Any mode where the HTML preview pane is visible. */
export function isPreviewVisibleMode(mode: ViewMode): boolean {
  return mode === ViewMode.PREVIEW || mode === ViewMode.SPLIT;
}

export type NonSplitViewMode =
  | ViewMode.EDITOR
  | ViewMode.LIVE
  | ViewMode.PREVIEW;

export function isNonSplitViewMode(mode: ViewMode): mode is NonSplitViewMode {
  return (
    mode === ViewMode.EDITOR ||
    mode === ViewMode.LIVE ||
    mode === ViewMode.PREVIEW
  );
}

/** Anchor used after leaving SPLIT via the view-mode toggle. */
export function resolveLastNonSplitViewMode(mode: ViewMode): NonSplitViewMode {
  if (mode === ViewMode.PREVIEW) return ViewMode.PREVIEW;
  if (mode === ViewMode.LIVE) return ViewMode.LIVE;
  if (mode === ViewMode.EDITOR) return ViewMode.EDITOR;
  // SPLIT (and any unknown) defaults toward Live Preview as the edit side.
  return ViewMode.LIVE;
}

/**
 * Toggle cycle: edit-solo ↔ SPLIT ↔ PREVIEW ↔ SPLIT ↔ …
 * Live Preview is the preferred edit-solo target when leaving preview.
 */
export function getNextViewMode(
  viewMode: ViewMode,
  lastNonSplitViewMode: NonSplitViewMode,
): ViewMode {
  if (viewMode === ViewMode.SPLIT) {
    return isEditorSoloMode(lastNonSplitViewMode)
      ? ViewMode.PREVIEW
      : ViewMode.LIVE;
  }
  return ViewMode.SPLIT;
}
