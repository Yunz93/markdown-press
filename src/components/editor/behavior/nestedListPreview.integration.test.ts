/** @vitest-environment happy-dom */

import { beforeEach, describe, expect, it } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import type { StateCommand } from "@codemirror/state";
import { clearMarkdownCache, renderMarkdown } from "../../utils/markdown";
import {
  createHandleListBackspace,
  handleListEnter,
  handleListTab,
} from "./nestedListCommands";

function applyCommand(
  cmd: StateCommand,
  doc: string,
  anchor: number,
  head: number,
): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
  let next = state;
  cmd({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
}

function previewHtml(doc: string): string {
  return renderMarkdown(doc, { orderedListMode: "strict", themeMode: "light" });
}

describe("nested list edit to preview integration", () => {
  beforeEach(() => {
    clearMarkdownCache();
  });

  it("Tab-nested unordered sibling renders nested ul in preview", () => {
    const doc = "- parent\n- child";
    const childLineStart = doc.indexOf("- child");
    const next = applyCommand(
      handleListTab(),
      doc,
      childLineStart + 2,
      childLineStart + 2,
    );

    expect(next.doc.toString()).toBe("- parent\n    - child");
    expect(
      previewHtml(next.doc.toString()).match(/<ul\b/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
  });

  it("three-level ordered markdown renders nested ol in preview", () => {
    const doc = ["1. top", "    1. mid", "        1. leaf"].join("\n");
    const html = previewHtml(doc);
    expect(html.match(/<ol/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/<li>leaf<\/li>/);
  });

  it("Enter on alpha list keeps preview ol type after continuation", () => {
    const doc = "A. first";
    const next = applyCommand(handleListEnter, doc, doc.length, doc.length);

    expect(next.doc.toString()).toMatch(/\nB\./);
    expect(previewHtml(next.doc.toString())).toMatch(/<ol[^>]*type="A"/);
  });

  it("strict backspace outdent then preview keeps flat ordered structure", () => {
    const doc = "1. parent\n    1. child";
    const cursorAtChildMarker = "1. parent\n    1. ".length;
    const next = applyCommand(
      createHandleListBackspace({ strictMode: true }),
      doc,
      cursorAtChildMarker,
      cursorAtChildMarker,
    );

    expect(next.doc.toString()).toBe("1. parent\n2. child");
    const html = previewHtml(next.doc.toString());
    expect(html).toMatch(/<li>parent<\/li>/);
    expect(html).toMatch(/<li>child<\/li>/);
    expect(html).not.toMatch(/<ol>\s*<ol>/);
  });

  it("blockquote nested list renders nested ul in preview", () => {
    const doc = ["> - parent", ">     - child"].join("\n");
    const html = previewHtml(doc);
    expect(html).toMatch(/<blockquote/);
    expect(html.match(/<ul\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("Tab-nested blockquote list keeps blockquote prefix on each line", () => {
    const doc = ["> 1. parent", "> 2. child"].join("\n");
    const childPos = doc.indexOf("2. child") + 2;
    const next = applyCommand(handleListTab(), doc, childPos, childPos);
    expect(next.doc.toString()).toBe(
      ["> 1. parent", ">     1. child"].join("\n"),
    );
  });
});
