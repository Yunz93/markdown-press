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

const SKIP_ANCESTOR_NODES = new Set([
  "FencedCode",
  "CodeBlock",
  "CommentBlock",
]);

const hideMarkDecoration = Decoration.replace({
  inclusive: true,
});

const hideUrlDecoration = Decoration.replace({
  inclusive: true,
});

function selectionTouchesRange(
  state: EditorState,
  from: number,
  to: number,
  pad = 0,
): boolean {
  const start = Math.max(0, from - pad);
  const end = Math.min(state.doc.length, to + pad);
  for (const range of state.selection.ranges) {
    if (range.from <= end && range.to >= start) {
      return true;
    }
  }
  return false;
}

function hasSkipAncestor(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1);
  for (let depth = 0; depth < 12 && node; depth += 1) {
    if (SKIP_ANCESTOR_NODES.has(node.name)) return true;
    if (!node.parent) break;
    node = node.parent;
  }
  return false;
}

function findInlineParentRange(
  state: EditorState,
  markFrom: number,
  markTo: number,
): { from: number; to: number } | null {
  const mid = Math.min(markFrom, Math.max(markFrom, markTo - 1));
  let node = syntaxTree(state).resolveInner(mid, 1);
  for (let depth = 0; depth < 10 && node; depth += 1) {
    if (INLINE_PARENT_NODES.has(node.name)) {
      return { from: node.from, to: node.to };
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

  const parent = findInlineParentRange(state, from, to);
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

  const parent = findInlineParentRange(state, from, to);
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

  // Collect then sort — tree iteration is ordered, but we may emit URL hides
  // interleaved with marks; RangeSetBuilder requires sorted non-overlapping adds.
  const ranges: Array<{ from: number; to: number; deco: Decoration }> = [];

  for (const { from: viewportFrom, to: viewportTo } of view.visibleRanges) {
    tree.iterate({
      from: viewportFrom,
      to: viewportTo,
      enter: (node) => {
        const { name, from, to } = node;
        if (from >= to) return;

        if (HIDEABLE_MARK_NODES.has(name)) {
          if (hasSkipAncestor(state, from)) return;
          if (shouldRevealMark(state, name, from, to)) return;
          ranges.push({ from, to, deco: hideMarkDecoration });
          return;
        }

        // Hide link/image destinations when the construct is inactive.
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
});
