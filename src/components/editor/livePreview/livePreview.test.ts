/** @vitest-environment happy-dom */

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it, afterEach } from "vitest";
import { livePreviewContextFacet } from "./context";
import { buildLivePreviewHideDecorations } from "./hideFormattingMarks";
import { buildLivePreviewImageDecorations } from "./images";
import { buildLivePreviewMathDecorations, findMathRangesInText } from "./math";
import { buildLivePreviewTaskDecorations } from "./taskCheckboxes";
import { buildLivePreviewWikiDecorations } from "./wiki";

function createView(doc: string, cursor = 0) {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      livePreviewContextFacet.of({
        sourceFilePath: null,
        rootFolderPath: null,
        files: [],
      }),
    ],
  });
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  return view;
}

describe("live preview hide formatting", () => {
  const views: EditorView[] = [];

  afterEach(() => {
    while (views.length) {
      const view = views.pop();
      view?.destroy();
      view?.dom.parentElement?.remove();
    }
  });

  function mount(doc: string, cursor = 0) {
    const view = createView(doc, cursor);
    views.push(view);
    return view;
  }

  it("hides emphasis marks when the cursor is away", () => {
    const view = mount("hello **world**\n\naway", 20);
    const deco = buildLivePreviewHideDecorations(view);
    const hidden: Array<[number, number]> = [];
    deco.between(0, view.state.doc.length, (from, to) => {
      hidden.push([from, to]);
    });
    expect(hidden.length).toBeGreaterThanOrEqual(2);
    expect(
      hidden.some(
        ([from, to]) => view.state.doc.sliceString(from, to) === "**",
      ),
    ).toBe(true);
  });

  it("reveals emphasis marks when the selection is inside the emphasis", () => {
    const view = mount("hello **world**", 8);
    const deco = buildLivePreviewHideDecorations(view);
    const hidden: Array<[number, number]> = [];
    deco.between(0, view.state.doc.length, (from, to) => {
      hidden.push([from, to]);
    });
    expect(hidden).toEqual([]);
  });

  it("hides heading marks on inactive lines", () => {
    const view = mount("# Title\n\nbody", 12);
    const deco = buildLivePreviewHideDecorations(view);
    const hiddenTexts: string[] = [];
    deco.between(0, view.state.doc.length, (from, to) => {
      hiddenTexts.push(view.state.doc.sliceString(from, to));
    });
    expect(hiddenTexts.some((text) => text.includes("#"))).toBe(true);
  });

  it("replaces task markers with widgets when inactive", () => {
    const view = mount("- [ ] todo\n\naway", 14);
    const deco = buildLivePreviewTaskDecorations(view);
    let widgetCount = 0;
    deco.between(0, view.state.doc.length, (_from, _to, value) => {
      if (value.spec.widget) widgetCount += 1;
    });
    expect(widgetCount).toBe(1);
  });

  it("keeps task markers visible on the active line", () => {
    const view = mount("- [ ] todo", 2);
    const deco = buildLivePreviewTaskDecorations(view);
    let widgetCount = 0;
    deco.between(0, view.state.doc.length, (_from, _to, value) => {
      if (value.spec.widget) widgetCount += 1;
    });
    expect(widgetCount).toBe(0);
  });

  it("replaces remote markdown images when inactive", () => {
    const doc = "see ![cat](https://example.com/cat.png)\n\naway";
    const view = mount(doc, doc.length - 1);
    const deco = buildLivePreviewImageDecorations(
      view,
      new Map(),
      () => undefined,
    );
    let widgetCount = 0;
    deco.between(0, view.state.doc.length, (_from, _to, value) => {
      if (value.spec.widget) widgetCount += 1;
    });
    expect(widgetCount).toBe(1);
  });

  it("replaces inactive math with widgets", () => {
    const view = mount("area $E=mc^2$ done\n\naway", 22);
    const deco = buildLivePreviewMathDecorations(view);
    let widgetCount = 0;
    deco.between(0, view.state.doc.length, (_from, _to, value) => {
      if (value.spec.widget) widgetCount += 1;
    });
    expect(widgetCount).toBe(1);
  });

  it("replaces wiki links with widgets when inactive", () => {
    const view = mount("see [[Note]] please\n\naway", 22);
    const deco = buildLivePreviewWikiDecorations(
      view,
      new Map(),
      () => undefined,
    );
    let widgetCount = 0;
    deco.between(0, view.state.doc.length, (_from, _to, value) => {
      if (value.spec.widget) widgetCount += 1;
    });
    expect(widgetCount).toBe(1);
  });
});

describe("findMathRangesInText", () => {
  it("finds inline and display math", () => {
    const ranges = findMathRangesInText("a $x$ b\n$$\ny\n$$\n");
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toMatchObject({
      content: "x",
      displayMode: false,
    });
    expect(ranges[1]).toMatchObject({
      content: "\ny\n",
      displayMode: true,
    });
  });

  it("skips empty math", () => {
    expect(findMathRangesInText("$$  $$\n$ $")).toEqual([]);
  });
});
