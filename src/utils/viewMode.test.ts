import { describe, expect, it } from "vitest";
import { ViewMode } from "../types";
import {
  getNextViewMode,
  isEditorSoloMode,
  isEditorVisibleMode,
  isPreviewVisibleMode,
  normalizeSessionViewMode,
  resolveLastNonSplitViewMode,
} from "./viewMode";

describe("viewMode helpers", () => {
  it("treats EDITOR and LIVE as editor-solo", () => {
    expect(isEditorSoloMode(ViewMode.EDITOR)).toBe(true);
    expect(isEditorSoloMode(ViewMode.LIVE)).toBe(true);
    expect(isEditorVisibleMode(ViewMode.LIVE)).toBe(true);
    expect(isPreviewVisibleMode(ViewMode.LIVE)).toBe(false);
    expect(isPreviewVisibleMode(ViewMode.EDITOR)).toBe(false);
    expect(isPreviewVisibleMode(ViewMode.PREVIEW)).toBe(true);
  });

  it("keeps editor/live/preview and maps legacy split onto live", () => {
    expect(normalizeSessionViewMode(ViewMode.EDITOR)).toBe(ViewMode.EDITOR);
    expect(normalizeSessionViewMode(ViewMode.LIVE)).toBe(ViewMode.LIVE);
    expect(normalizeSessionViewMode(ViewMode.PREVIEW)).toBe(ViewMode.PREVIEW);
    expect(normalizeSessionViewMode(ViewMode.SPLIT)).toBe(ViewMode.LIVE);
    expect(resolveLastNonSplitViewMode(ViewMode.EDITOR)).toBe(ViewMode.EDITOR);
    expect(resolveLastNonSplitViewMode(ViewMode.SPLIT)).toBe(ViewMode.LIVE);
    expect(resolveLastNonSplitViewMode(ViewMode.PREVIEW)).toBe(
      ViewMode.PREVIEW,
    );
  });

  it("cycles source → live → reading → source", () => {
    expect(getNextViewMode(ViewMode.EDITOR)).toBe(ViewMode.LIVE);
    expect(getNextViewMode(ViewMode.LIVE)).toBe(ViewMode.PREVIEW);
    expect(getNextViewMode(ViewMode.PREVIEW)).toBe(ViewMode.EDITOR);
    expect(getNextViewMode(ViewMode.SPLIT)).toBe(ViewMode.PREVIEW);
  });
});
