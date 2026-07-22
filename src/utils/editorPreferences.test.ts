import { describe, expect, it } from "vitest";
import { ViewMode } from "../types";
import {
  normalizeDefaultViewMode,
  normalizeTabSize,
} from "./editorPreferences";

describe("normalizeTabSize", () => {
  it("clamps to 2 or 4", () => {
    expect(normalizeTabSize(2)).toBe(2);
    expect(normalizeTabSize(4)).toBe(4);
    expect(normalizeTabSize(3)).toBe(4);
    expect(normalizeTabSize("2")).toBe(2);
    expect(normalizeTabSize(undefined)).toBe(4);
  });
});

describe("normalizeDefaultViewMode", () => {
  it("defaults unknown values to split", () => {
    expect(normalizeDefaultViewMode(undefined)).toBe(ViewMode.SPLIT);
    expect(normalizeDefaultViewMode("nope")).toBe(ViewMode.SPLIT);
  });

  it("keeps valid view modes", () => {
    expect(normalizeDefaultViewMode("EDITOR")).toBe(ViewMode.EDITOR);
    expect(normalizeDefaultViewMode(ViewMode.PREVIEW)).toBe(ViewMode.PREVIEW);
    expect(normalizeDefaultViewMode("SPLIT")).toBe(ViewMode.SPLIT);
  });
});
