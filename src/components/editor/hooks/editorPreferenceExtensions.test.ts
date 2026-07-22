import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import {
  buildCloseBracketsExtension,
  buildGutterExtension,
  buildIndentExtension,
  buildIndentGuidesExtension,
  buildSpellcheckExtension,
} from "./editorPreferenceExtensions";

describe("editorPreferenceExtensions", () => {
  it("enables close brackets only when at least one pairing toggle is on", () => {
    expect(buildCloseBracketsExtension(false, false)).toEqual([]);
    expect(buildCloseBracketsExtension(true, false)).not.toEqual([]);
    expect(buildCloseBracketsExtension(false, true)).not.toEqual([]);
  });

  it("builds indent unit from tab size and useTabs", () => {
    const spaces = EditorState.create({
      doc: "",
      extensions: buildIndentExtension(2, false),
    });
    expect(spaces.tabSize).toBe(2);
    expect(spaces.facet(indentUnit)).toBe("  ");

    const tabs = EditorState.create({
      doc: "",
      extensions: buildIndentExtension(4, true),
    });
    expect(tabs.tabSize).toBe(4);
    expect(tabs.facet(indentUnit)).toBe("\t");
  });

  it("returns empty gutter / guide extensions when toggles are off", () => {
    expect(buildGutterExtension(false, false)).toEqual([]);
    expect(buildIndentGuidesExtension(false)).toEqual([]);
    expect(buildGutterExtension(true, false)).not.toEqual([]);
    expect(buildIndentGuidesExtension(true)).not.toEqual([]);
  });

  it("builds spellcheck content attributes", () => {
    expect(buildSpellcheckExtension(true)).toBeTruthy();
    expect(buildSpellcheckExtension(false)).toBeTruthy();
  });
});
