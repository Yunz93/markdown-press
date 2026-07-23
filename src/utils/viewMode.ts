import { ViewMode } from "../types";

/** Supported session modes after removing source-only and split. */
export type SessionViewMode = ViewMode.LIVE | ViewMode.PREVIEW;

/** Map legacy EDITOR / SPLIT (and unknown) onto LIVE or PREVIEW. */
export function normalizeSessionViewMode(mode: ViewMode): SessionViewMode {
  return mode === ViewMode.PREVIEW ? ViewMode.PREVIEW : ViewMode.LIVE;
}

/** Solo editing surfaces (no HTML preview pane). */
export function isEditorSoloMode(mode: ViewMode): boolean {
  return normalizeSessionViewMode(mode) === ViewMode.LIVE;
}

/** Any mode where the CodeMirror editor pane is visible. */
export function isEditorVisibleMode(mode: ViewMode): boolean {
  return isEditorSoloMode(mode);
}

/** Any mode where the HTML preview pane is visible. */
export function isPreviewVisibleMode(mode: ViewMode): boolean {
  return normalizeSessionViewMode(mode) === ViewMode.PREVIEW;
}

/** @deprecated Use SessionViewMode; kept for store field typing. */
export type NonSplitViewMode = SessionViewMode;

export function isNonSplitViewMode(mode: ViewMode): mode is NonSplitViewMode {
  return mode === ViewMode.LIVE || mode === ViewMode.PREVIEW;
}

/** Anchor used when leaving a temporary preview-only file. */
export function resolveLastNonSplitViewMode(mode: ViewMode): NonSplitViewMode {
  return normalizeSessionViewMode(mode);
}

/** Toggle cycle: Live Preview ↔ Reading. */
export function getNextViewMode(viewMode: ViewMode): ViewMode {
  return normalizeSessionViewMode(viewMode) === ViewMode.PREVIEW
    ? ViewMode.LIVE
    : ViewMode.PREVIEW;
}
