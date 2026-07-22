import { ViewMode } from "../types";

export const DEFAULT_TAB_SIZE = 4;

export function normalizeTabSize(value: unknown): 2 | 4 {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  if (numeric === 2) return 2;
  if (numeric === 4) return 4;
  return DEFAULT_TAB_SIZE;
}

export function normalizeDefaultViewMode(value: unknown): ViewMode {
  if (value === ViewMode.EDITOR || value === "EDITOR") {
    return ViewMode.EDITOR;
  }
  if (value === ViewMode.PREVIEW || value === "PREVIEW") {
    return ViewMode.PREVIEW;
  }
  if (value === ViewMode.SPLIT || value === "SPLIT") {
    return ViewMode.SPLIT;
  }
  return ViewMode.SPLIT;
}
