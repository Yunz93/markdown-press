import { describe, expect, it } from "vitest";
import { ViewMode } from "../types";
import {
  getNextViewMode,
  isEditorSoloMode,
  isEditorVisibleMode,
  isPreviewVisibleMode,
  resolveLastNonSplitViewMode,
} from "./viewMode";

describe("viewMode helpers", () => {
  it("treats LIVE as editor-solo", () => {
    expect(isEditorSoloMode(ViewMode.LIVE)).toBe(true);
    expect(isEditorVisibleMode(ViewMode.LIVE)).toBe(true);
    expect(isPreviewVisibleMode(ViewMode.LIVE)).toBe(false);
  });

  it("resolves last non-split anchors", () => {
    expect(resolveLastNonSplitViewMode(ViewMode.LIVE)).toBe(ViewMode.LIVE);
    expect(resolveLastNonSplitViewMode(ViewMode.EDITOR)).toBe(ViewMode.EDITOR);
    expect(resolveLastNonSplitViewMode(ViewMode.PREVIEW)).toBe(
      ViewMode.PREVIEW,
    );
    expect(resolveLastNonSplitViewMode(ViewMode.SPLIT)).toBe(ViewMode.LIVE);
  });

  it("cycles through split and live preview", () => {
    expect(getNextViewMode(ViewMode.LIVE, ViewMode.LIVE)).toBe(ViewMode.SPLIT);
    expect(getNextViewMode(ViewMode.SPLIT, ViewMode.LIVE)).toBe(
      ViewMode.PREVIEW,
    );
    expect(getNextViewMode(ViewMode.PREVIEW, ViewMode.PREVIEW)).toBe(
      ViewMode.SPLIT,
    );
    expect(getNextViewMode(ViewMode.SPLIT, ViewMode.PREVIEW)).toBe(
      ViewMode.LIVE,
    );
    expect(getNextViewMode(ViewMode.SPLIT, ViewMode.EDITOR)).toBe(
      ViewMode.PREVIEW,
    );
  });
});
