/** @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { livePreviewShouldRebuild } from "./shared";

describe("livePreviewShouldRebuild", () => {
  it("rebuilds marks on any selection change, but not widgets on same-line caret moves", () => {
    const start = EditorState.create({
      doc: "hello world\n\nmore",
      selection: { anchor: 1 },
    });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({ state: start, parent });
    view.dispatch({ selection: { anchor: 3 } });
    const shim = {
      docChanged: false,
      viewportChanged: false,
      selectionSet: true,
      startState: start,
      state: view.state,
    } as never;
    expect(livePreviewShouldRebuild(shim, "marks")).toBe(true);
    expect(livePreviewShouldRebuild(shim, "widgets")).toBe(false);
    view.destroy();
    parent.remove();
  });

  it("rebuilds widgets when the caret crosses a line", () => {
    const start = EditorState.create({
      doc: "hello world\n\nmore",
      selection: { anchor: 1 },
    });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({ state: start, parent });
    view.dispatch({ selection: { anchor: 14 } });
    const shim = {
      docChanged: false,
      viewportChanged: false,
      selectionSet: true,
      startState: start,
      state: view.state,
    } as never;
    expect(livePreviewShouldRebuild(shim, "widgets")).toBe(true);
    view.destroy();
    parent.remove();
  });
});
