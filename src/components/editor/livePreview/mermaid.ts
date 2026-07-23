/**
 * Live Preview Mermaid widgets for ```mermaid fenced blocks.
 */

import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { renderMermaidDiagrams } from "../../../utils/markdown-extensions";
import { isHeavyLivePreviewState } from "../hooks/codeMirrorHelpers";
import { livePreviewContextFacet } from "./context";
import {
  livePreviewContextChanged,
  livePreviewShouldRebuild,
  selectionTouchesRange,
} from "./shared";

const mermaidRenderedEffect = StateEffect.define<null>();

class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly themeMode: "light" | "dark",
  ) {
    super();
  }

  eq(other: MermaidWidget) {
    return this.source === other.source && this.themeMode === other.themeMode;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-live-preview-mermaid";
    wrap.setAttribute("contenteditable", "false");
    const diagram = document.createElement("div");
    diagram.className = "mermaid";
    diagram.textContent = this.source;
    wrap.appendChild(diagram);

    const themeMode = this.themeMode;
    queueMicrotask(() => {
      void renderMermaidDiagrams(wrap, { themeMode }).catch(() => {
        wrap.classList.add("is-error");
        wrap.textContent = "Mermaid render failed";
      });
    });

    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

function extractFencedInfo(
  state: { doc: { sliceString: (a: number, b: number) => string } },
  from: number,
  to: number,
) {
  const text = state.doc.sliceString(from, to);
  const open = text.match(/^```([^\n]*)\n/);
  const lang = (open?.[1] ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const close = text.lastIndexOf("\n```");
  const body =
    open && close > open[0].length ? text.slice(open[0].length, close) : "";
  return { lang, body };
}

export function buildLivePreviewMermaidDecorations(
  view: EditorView,
): DecorationSet {
  if (isHeavyLivePreviewState(view.state)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const ctx = state.facet(livePreviewContextFacet);
  const themeMode = ctx.themeMode ?? "light";
  const tree =
    ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state);

  for (const { from: viewportFrom, to: viewportTo } of view.visibleRanges) {
    tree.iterate({
      from: viewportFrom,
      to: viewportTo,
      enter: (node) => {
        if (node.name !== "FencedCode") return;
        const { from, to } = node;
        if (selectionTouchesRange(state, from, to)) return;
        const { lang, body } = extractFencedInfo(state, from, to);
        if (lang !== "mermaid" && lang !== "mmd") return;
        if (!body.trim()) return;

        builder.add(
          from,
          to,
          Decoration.replace({
            widget: new MermaidWidget(body, themeMode),
            block: true,
          }),
        );
      },
    });
  }

  return builder.finish();
}

export const livePreviewMermaid = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewMermaidDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        livePreviewShouldRebuild(update, "widgets") ||
        livePreviewContextChanged(update) ||
        update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(mermaidRenderedEffect)),
        )
      ) {
        this.decorations = buildLivePreviewMermaidDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
