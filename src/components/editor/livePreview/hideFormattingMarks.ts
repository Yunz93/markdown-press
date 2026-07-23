/**
 * Obsidian-style Live Preview: hide Markdown formatting marks when the
 * selection is not touching that construct. Source text stays in the document;
 * only the view is transformed via Decoration.replace.
 */

import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { isLargeEditorState } from "../hooks/codeMirrorHelpers";
import {
  collectWikiLinkRanges,
  hasSkipAncestor,
  rangesOverlap,
  selectionTouchesRange,
} from "./shared";
import { findCalloutRanges } from "./callouts";

const HIDEABLE_MARK_NODES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "LinkMark",
  "QuoteMark",
  "SubscriptMark",
  "SuperscriptMark",
]);

/** Parent constructs that should reveal their marks when selection touches them. */
const INLINE_PARENT_NODES = new Set([
  "Emphasis",
  "StrongEmphasis",
  "InlineCode",
  "Strikethrough",
  "Link",
  "Image",
  "Subscript",
  "Superscript",
  "Autolink",
]);

const BLOCK_MARK_NODES = new Set(["HeaderMark", "QuoteMark"]);

const hideMarkDecoration = Decoration.replace({
  inclusive: true,
});

const hideUrlDecoration = Decoration.replace({
  inclusive: true,
});

function findInlineParent(
  state: EditorState,
  markFrom: number,
  markTo: number,
): { name: string; from: number; to: number } | null {
  const mid = Math.min(markFrom, Math.max(markFrom, markTo - 1));
  let node = syntaxTree(state).resolveInner(mid, 1);
  for (let depth = 0; depth < 10 && node; depth += 1) {
    if (INLINE_PARENT_NODES.has(node.name)) {
      return { name: node.name, from: node.from, to: node.to };
    }
    if (!node.parent) break;
    node = node.parent;
  }
  return null;
}

function shouldRevealMark(
  state: EditorState,
  name: string,
  from: number,
  to: number,
): boolean {
  if (BLOCK_MARK_NODES.has(name)) {
    const line = state.doc.lineAt(from);
    return selectionTouchesRange(state, line.from, line.to);
  }

  const parent = findInlineParent(state, from, to);
  if (parent) {
    return selectionTouchesRange(state, parent.from, parent.to);
  }

  return selectionTouchesRange(state, from, to, 1);
}

function shouldHideUrl(state: EditorState, from: number, to: number): boolean {
  // Autolink body is the URL itself — never hide it.
  let node = syntaxTree(state).resolveInner(from, 1);
  for (let depth = 0; depth < 8 && node; depth += 1) {
    if (node.name === "Autolink") return false;
    if (!node.parent) break;
    node = node.parent;
  }

  const parent = findInlineParent(state, from, to);
  // Inactive images/links are fully replaced by widgets — skip partial hides.
  if (parent?.name === "Image" || parent?.name === "Link") {
    return false;
  }
  if (parent) {
    return !selectionTouchesRange(state, parent.from, parent.to);
  }
  return !selectionTouchesRange(state, from, to, 1);
}

export function buildLivePreviewHideDecorations(
  view: EditorView,
): DecorationSet {
  if (isLargeEditorState(view.state)) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const tree =
    ensureSyntaxTree(state, state.doc.length, 50) ?? syntaxTree(state);
  const docText = state.doc.toString();
  const wikiRanges = view.visibleRanges.flatMap(({ from, to }) =>
    collectWikiLinkRanges(
      docText,
      Math.max(0, from - 2),
      Math.min(docText.length, to + 2),
    ),
  );
  const calloutRanges = findCalloutRanges(docText);

  const ranges: Array<{ from: number; to: number; deco: Decoration }> = [];

  for (const { from: viewportFrom, to: viewportTo } of view.visibleRanges) {
    tree.iterate({
      from: viewportFrom,
      to: viewportTo,
      enter: (node) => {
        const { name, from, to } = node;
        if (from >= to) return;
        if (wikiRanges.some((w) => rangesOverlap(from, to, w.from, w.to))) {
          return;
        }
        if (calloutRanges.some((c) => rangesOverlap(from, to, c.from, c.to))) {
          return;
        }

        if (HIDEABLE_MARK_NODES.has(name)) {
          if (hasSkipAncestor(state, from)) return;
          const parent = findInlineParent(state, from, to);
          // Image/Link widgets replace the whole construct when inactive.
          if (
            (parent?.name === "Image" || parent?.name === "Link") &&
            !selectionTouchesRange(state, parent.from, parent.to)
          ) {
            return;
          }
          if (shouldRevealMark(state, name, from, to)) return;
          ranges.push({ from, to, deco: hideMarkDecoration });
          return;
        }

        if (name === "URL") {
          if (hasSkipAncestor(state, from)) return;
          if (!shouldHideUrl(state, from, to)) return;
          ranges.push({ from, to, deco: hideUrlDecoration });
        }
      },
    });
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  let lastTo = -1;
  for (const range of ranges) {
    if (range.from < lastTo) continue;
    builder.add(range.from, range.to, range.deco);
    lastTo = range.to;
  }

  return builder.finish();
}

export const livePreviewHideFormatting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreviewHideDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildLivePreviewHideDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations ?? Decoration.none;
      }),
  },
);

export const livePreviewTheme = EditorView.baseTheme({
  ".cm-live-preview-task": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.05em",
    height: "1.05em",
    marginInline: "0.1em 0.35em",
    verticalAlign: "middle",
    cursor: "pointer",
    border: "1.5px solid var(--mp-doc-list-marker, #94a3b8)",
    borderRadius: "0.25em",
    background: "transparent",
    padding: 0,
    color: "inherit",
  },
  ".cm-live-preview-task[data-checked='true']": {
    background: "var(--mp-doc-accent, #2563eb)",
    borderColor: "var(--mp-doc-accent, #2563eb)",
  },
  ".cm-live-preview-task[data-checked='true']::after": {
    content: '""',
    width: "0.35em",
    height: "0.6em",
    borderRight: "2px solid #fff",
    borderBottom: "2px solid #fff",
    transform: "rotate(40deg) translate(-0.05em, -0.08em)",
  },
  ".cm-live-preview-image-wrap": {
    display: "inline-block",
    maxWidth: "100%",
    verticalAlign: "middle",
    marginBlock: "0.35em",
  },
  ".cm-live-preview-image-wrap.is-loading": {
    minWidth: "4rem",
    minHeight: "2.5rem",
    background:
      "color-mix(in srgb, var(--mp-doc-muted, #94a3b8) 18%, transparent)",
    borderRadius: "0.4rem",
  },
  ".cm-live-preview-image": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    borderRadius: "0.35rem",
  },
  ".cm-live-preview-math": {
    display: "inline-block",
    verticalAlign: "middle",
  },
  ".cm-live-preview-math-display": {
    display: "block",
    width: "100%",
    marginBlock: "0.65em",
    overflowX: "auto",
    textAlign: "center",
  },
  ".cm-live-preview-wiki": {
    color: "var(--mp-doc-accent, #2563eb)",
    textDecoration: "underline",
    textUnderlineOffset: "0.15em",
    cursor: "pointer",
  },
  ".cm-live-preview-wiki.is-unresolved": {
    color: "var(--mp-doc-muted, #94a3b8)",
    textDecorationStyle: "dashed",
  },
  ".cm-live-preview-link": {
    color: "var(--mp-doc-accent, #2563eb)",
    textDecoration: "underline",
    textUnderlineOffset: "0.15em",
    cursor: "pointer",
  },
  ".cm-live-preview-table-wrap": {
    display: "block",
    width: "100%",
    overflowX: "auto",
    marginBlock: "0.75em",
  },
  ".cm-live-preview-table": {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: "0.95em",
  },
  ".cm-live-preview-table th, .cm-live-preview-table td": {
    border:
      "1px solid color-mix(in srgb, var(--mp-doc-muted, #94a3b8) 35%, transparent)",
    padding: "0.4em 0.65em",
    verticalAlign: "top",
  },
  ".cm-live-preview-table th": {
    background:
      "color-mix(in srgb, var(--mp-doc-muted, #94a3b8) 12%, transparent)",
    fontWeight: "650",
  },
  ".cm-live-preview-callout": {
    display: "block",
    marginBlock: "0.75em",
    padding: "0.65em 0.85em",
    borderRadius: "0.45rem",
    borderInlineStart: "4px solid var(--mp-doc-accent, #2563eb)",
    background:
      "color-mix(in srgb, var(--mp-doc-accent, #2563eb) 8%, transparent)",
  },
  ".cm-live-preview-callout-title": {
    fontWeight: "700",
    marginBottom: "0.35em",
    textTransform: "capitalize",
  },
  ".cm-live-preview-callout-warning, .cm-live-preview-callout-caution": {
    borderInlineStartColor: "#d97706",
    background: "color-mix(in srgb, #d97706 10%, transparent)",
  },
  ".cm-live-preview-callout-error, .cm-live-preview-callout-danger, .cm-live-preview-callout-bug":
    {
      borderInlineStartColor: "#dc2626",
      background: "color-mix(in srgb, #dc2626 10%, transparent)",
    },
  ".cm-live-preview-callout-success, .cm-live-preview-callout-tip": {
    borderInlineStartColor: "#16a34a",
    background: "color-mix(in srgb, #16a34a 10%, transparent)",
  },
  ".cm-live-preview-hr": {
    border: "none",
    borderTop:
      "1px solid color-mix(in srgb, var(--mp-doc-muted, #94a3b8) 45%, transparent)",
    marginBlock: "1em",
  },
  ".cm-live-preview-list-marker": {
    display: "inline-block",
    minWidth: "1.1em",
    marginInlineEnd: "0.35em",
    color: "var(--mp-doc-list-marker, #94a3b8)",
    textAlign: "right",
  },
  ".cm-live-preview-highlight": {
    background: "color-mix(in srgb, #eab308 35%, transparent)",
    borderRadius: "0.15em",
    paddingInline: "0.1em",
  },
  ".cm-live-preview-mermaid": {
    display: "block",
    width: "100%",
    overflowX: "auto",
    marginBlock: "0.75em",
    padding: "0.5em",
    borderRadius: "0.45rem",
    background:
      "color-mix(in srgb, var(--mp-doc-muted, #94a3b8) 8%, transparent)",
  },
  ".cm-live-preview-note-embed": {
    display: "block",
    marginBlock: "0.75em",
    padding: "0.65em 0.85em",
    borderRadius: "0.45rem",
    border:
      "1px solid color-mix(in srgb, var(--mp-doc-muted, #94a3b8) 30%, transparent)",
    background:
      "color-mix(in srgb, var(--mp-doc-muted, #94a3b8) 6%, transparent)",
  },
  ".cm-live-preview-note-embed-title": {
    display: "inline-block",
    fontWeight: "650",
    color: "var(--mp-doc-accent, #2563eb)",
    textDecoration: "underline",
    textUnderlineOffset: "0.15em",
    marginBottom: "0.35em",
    cursor: "pointer",
  },
  ".cm-live-preview-note-embed-body": {
    fontSize: "0.95em",
    opacity: "0.92",
  },
});
