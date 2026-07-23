/**
 * Live Preview: Callouts `> [!type] Title` and horizontal rules.
 */

import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { renderMarkdown } from "../../../utils/markdown";
import { isHeavyLivePreviewState } from "../hooks/codeMirrorHelpers";
import {
  getCachedMarkdownHtml,
  hasSkipAncestor,
  livePreviewShouldRebuild,
  selectionTouchesRange,
} from "./shared";

const CALLOUT_START = /^>\s*\[!([A-Za-z0-9_-]+)\]([+-]?)\s*(.*)$/;

export interface CalloutRange {
  from: number;
  to: number;
  type: string;
  foldable: boolean;
  title: string;
  bodyMarkdown: string;
}

export function findCalloutRanges(docText: string): CalloutRange[] {
  const lines = docText.split("\n");
  const ranges: CalloutRange[] = [];
  let i = 0;
  let offset = 0;

  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(CALLOUT_START);
    if (!match) {
      offset += line.length + 1;
      i += 1;
      continue;
    }

    const type = match[1].toLowerCase();
    const foldable = match[2] === "+" || match[2] === "-";
    const title = (match[3] ?? "").trim() || type;
    const from = offset;
    const bodyLines: string[] = [];
    let j = i + 1;
    let endOffset = offset + line.length;

    while (j < lines.length) {
      const next = lines[j];
      if (!next.startsWith(">")) break;
      const content = next.replace(/^>\s?/, "");
      bodyLines.push(content);
      endOffset += 1 + next.length;
      j += 1;
    }

    ranges.push({
      from,
      to: endOffset,
      type,
      foldable,
      title,
      bodyMarkdown: bodyLines.join("\n"),
    });

    for (let k = i; k < j; k += 1) {
      offset += lines[k].length + 1;
    }
    i = j;
  }

  return ranges;
}

class CalloutWidget extends WidgetType {
  constructor(
    readonly type: string,
    readonly title: string,
    readonly bodyHtml: string,
  ) {
    super();
  }

  eq(other: CalloutWidget) {
    return (
      this.type === other.type &&
      this.title === other.title &&
      this.bodyHtml === other.bodyHtml
    );
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = `cm-live-preview-callout cm-live-preview-callout-${this.type}`;
    wrap.setAttribute("contenteditable", "false");
    wrap.setAttribute("data-callout", this.type);

    const title = document.createElement("div");
    title.className = "cm-live-preview-callout-title";
    title.textContent = this.title;
    wrap.appendChild(title);

    if (this.bodyHtml.trim()) {
      const body = document.createElement("div");
      body.className = "cm-live-preview-callout-body markdown-body";
      body.innerHTML = this.bodyHtml;
      wrap.appendChild(body);
    }

    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-live-preview-hr";
    return hr;
  }

  ignoreEvent() {
    return true;
  }
}

export function buildLivePreviewCalloutDecorations(
  view: EditorView,
): DecorationSet {
  if (isHeavyLivePreviewState(view.state)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const docText = state.doc.toString();
  const viewFrom = view.visibleRanges.length
    ? Math.min(...view.visibleRanges.map((range) => range.from))
    : 0;
  const viewTo = view.visibleRanges.length
    ? Math.max(...view.visibleRanges.map((range) => range.to))
    : state.doc.length;
  const ranges: Array<{ from: number; to: number; deco: Decoration }> = [];

  for (const callout of findCalloutRanges(docText)) {
    if (callout.to < viewFrom || callout.from > viewTo) continue;
    if (selectionTouchesRange(state, callout.from, callout.to)) continue;
    if (hasSkipAncestor(state, callout.from)) continue;

    let bodyHtml = "";
    if (callout.bodyMarkdown.trim()) {
      try {
        bodyHtml = getCachedMarkdownHtml(callout.bodyMarkdown, renderMarkdown);
      } catch {
        bodyHtml = "";
      }
    }

    ranges.push({
      from: callout.from,
      to: callout.to,
      deco: Decoration.replace({
        widget: new CalloutWidget(callout.type, callout.title, bodyHtml),
        block: true,
      }),
    });
  }

  // Horizontal rules via lezer HorizontalRule or --- lines
  treeIterateHr(view, (from, to) => {
    if (selectionTouchesRange(state, from, to)) return;
    if (hasSkipAncestor(state, from)) return;
    ranges.push({
      from,
      to,
      deco: Decoration.replace({
        widget: new HorizontalRuleWidget(),
        block: true,
      }),
    });
  });

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  let lastTo = -1;
  for (const range of ranges) {
    if (range.from < lastTo) continue;
    builder.add(range.from, range.to, range.deco);
    lastTo = range.to;
  }

  return builder.finish();
}

function treeIterateHr(
  view: EditorView,
  visit: (from: number, to: number) => void,
) {
  const { state } = view;
  const tree = syntaxTree(state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name === "HorizontalRule") {
          visit(node.from, node.to);
        }
      },
    });
  }
}

export const livePreviewCallouts = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewCalloutDecorations(view);
    }

    update(update: ViewUpdate) {
      if (livePreviewShouldRebuild(update, "widgets")) {
        this.decorations = buildLivePreviewCalloutDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);
