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
  it("treats LIVE as editor-solo", () => {
    expect(isEditorSoloMode(ViewMode.LIVE)).toBe(true);
    expect(isEditorVisibleMode(ViewMode.LIVE)).toBe(true);
    expect(isPreviewVisibleMode(ViewMode.LIVE)).toBe(false);
  });

  it("maps legacy editor/split onto live", () => {
    expect(normalizeSessionViewMode(ViewMode.EDITOR)).toBe(ViewMode.LIVE);
    expect(normalizeSessionViewMode(ViewMode.SPLIT)).toBe(ViewMode.LIVE);
    expect(resolveLastNonSplitViewMode(ViewMode.EDITOR)).toBe(ViewMode.LIVE);
    expect(resolveLastNonSplitViewMode(ViewMode.SPLIT)).toBe(ViewMode.LIVE);
    expect(resolveLastNonSplitViewMode(ViewMode.PREVIEW)).toBe(
      ViewMode.PREVIEW,
    );
  });

  it("cycles between live preview and reading", () => {
    expect(getNextViewMode(ViewMode.LIVE)).toBe(ViewMode.PREVIEW);
    expect(getNextViewMode(ViewMode.PREVIEW)).toBe(ViewMode.LIVE);
    expect(getNextViewMode(ViewMode.EDITOR)).toBe(ViewMode.PREVIEW);
    expect(getNextViewMode(ViewMode.SPLIT)).toBe(ViewMode.PREVIEW);
  });
});
