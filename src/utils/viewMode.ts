import { ViewMode } from "../types";

/**
 * Supported session modes: source edit, Live Preview, and Reading.
 * SPLIT remains in the enum for persisted legacy values but is normalized away.
 */
export type SessionViewMode =
  | ViewMode.EDITOR
  | ViewMode.LIVE
  | ViewMode.PREVIEW;

/** Map legacy SPLIT (and unknown) onto a supported session mode. */
export function normalizeSessionViewMode(mode: ViewMode): SessionViewMode {
  if (mode === ViewMode.PREVIEW) return ViewMode.PREVIEW;
  if (mode === ViewMode.EDITOR) return ViewMode.EDITOR;
  // LIVE and legacy SPLIT → LIVE
  return ViewMode.LIVE;
}

/** Solo editing surfaces (editor pane only; no HTML preview pane). */
export function isEditorSoloMode(mode: ViewMode): boolean {
  const normalized = normalizeSessionViewMode(mode);
  return normalized === ViewMode.EDITOR || normalized === ViewMode.LIVE;
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
  return (
    mode === ViewMode.EDITOR ||
    mode === ViewMode.LIVE ||
    mode === ViewMode.PREVIEW
  );
}

/** Anchor used when leaving a temporary preview-only file. */
export function resolveLastNonSplitViewMode(mode: ViewMode): NonSplitViewMode {
  return normalizeSessionViewMode(mode);
}

/**
 * Toggle cycle: Editor → Live → Reading → Editor.
 * Prefer Live as the default landing when leaving Reading from a legacy SPLIT.
 */
export function getNextViewMode(viewMode: ViewMode): ViewMode {
  const normalized = normalizeSessionViewMode(viewMode);
  if (normalized === ViewMode.EDITOR) return ViewMode.LIVE;
  if (normalized === ViewMode.LIVE) return ViewMode.PREVIEW;
  return ViewMode.EDITOR;
}
