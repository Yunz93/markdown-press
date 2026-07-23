import type { EditorState, Extension, Transaction } from "@codemirror/state";
import { StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  EditorView,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { WIKI_LINK_REGEX } from "../../../utils/markdownLinkUtils";
import { LRUCache } from "../../../utils/performance";
import { livePreviewContextFacet } from "./context";

const SKIP_ANCESTOR_NODES = new Set([
  "FencedCode",
  "CodeBlock",
  "CommentBlock",
  "InlineCode",
]);

export function selectionTouchesRange(
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

export function hasSkipAncestor(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1);
  for (let depth = 0; depth < 12 && node; depth += 1) {
    if (SKIP_ANCESTOR_NODES.has(node.name)) return true;
    if (!node.parent) break;
    node = node.parent;
  }
  return false;
}

export interface WikiLinkRange {
  from: number;
  to: number;
  raw: string;
  embed: boolean;
}

/** Collect closed wiki-link / embed ranges overlapping [from, to). */
export function collectWikiLinkRanges(
  text: string,
  from: number,
  to: number,
): WikiLinkRange[] {
  const ranges: WikiLinkRange[] = [];
  const slice = text.slice(from, to);
  const regex = new RegExp(WIKI_LINK_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(slice)) !== null) {
    const absoluteFrom = from + match.index;
    const absoluteTo = absoluteFrom + match[0].length;
    ranges.push({
      from: absoluteFrom,
      to: absoluteTo,
      raw: (match[1] ?? "").trim(),
      embed: match[0].startsWith("!"),
    });
  }
  return ranges;
}

export function rangesOverlap(
  aFrom: number,
  aTo: number,
  bFrom: number,
  bTo: number,
): boolean {
  return aFrom < bTo && bFrom < aTo;
}

/** True when live-preview context facet identity changed (files/theme/callbacks). */
export function livePreviewContextChanged(update: ViewUpdate): boolean {
  return (
    update.startState.facet(livePreviewContextFacet) !==
    update.state.facet(livePreviewContextFacet)
  );
}

/**
 * Decide whether a Live Preview decoration plugin should rebuild.
 * - `marks`: rebuild on every selection change (hide/reveal formatting).
 * - `widgets`: rebuild when selection crosses a line or becomes non-empty,
 *   not on every caret nudge within a line (avoids KaTeX/markdown-it thrash).
 */
export function livePreviewShouldRebuild(
  update: ViewUpdate,
  mode: "marks" | "widgets" = "widgets",
): boolean {
  if (update.docChanged || update.viewportChanged) return true;
  if (syntaxTree(update.startState) !== syntaxTree(update.state)) return true;
  if (!update.selectionSet) return false;
  if (mode === "marks") return true;

  const prev = update.startState.selection.main;
  const next = update.state.selection.main;
  if (prev.empty !== next.empty) return true;
  if (!next.empty || !prev.empty) return true;
  try {
    const prevLine = update.startState.doc.lineAt(prev.head).number;
    const nextLine = update.state.doc.lineAt(next.head).number;
    return prevLine !== nextLine;
  } catch {
    return true;
  }
}

/** Viewport union padded for decoration builds. */
export function getPaddedVisibleRange(
  view: Pick<EditorView, "visibleRanges" | "state">,
  pad = 200,
): { from: number; to: number } {
  let from = view.state.doc.length;
  let to = 0;
  for (const range of view.visibleRanges) {
    from = Math.min(from, range.from);
    to = Math.max(to, range.to);
  }
  if (to < from) {
    return { from: 0, to: view.state.doc.length };
  }
  return {
    from: Math.max(0, from - pad),
    to: Math.min(view.state.doc.length, to + pad),
  };
}

const inlineHtmlCache = new LRUCache<string, string>(256);

/** Cache markdown-it HTML for Live Preview widgets. */
export function getCachedMarkdownHtml(
  markdown: string,
  render: (source: string) => string,
): string {
  const cached = inlineHtmlCache.get(markdown);
  if (cached !== undefined) return cached;
  const html = render(markdown);
  inlineHtmlCache.set(markdown, html);
  return html;
}

/**
 * CodeMirror forbids `block: true` decorations from ViewPlugins.
 * Provide them from a StateField instead (same pattern as Live Preview tables).
 */
export function defineLivePreviewBlockDecorationField(options: {
  create: (state: EditorState) => DecorationSet;
  /** Extra rebuild triggers (async resolve effects, etc.). */
  rebuildOn?: (tr: Transaction) => boolean;
  /** Map through changes when not rebuilding (default true). */
  mapWhenIdle?: boolean;
}): Extension {
  const field = StateField.define<DecorationSet>({
    create: options.create,
    update(deco, tr) {
      const contextChanged =
        tr.startState.facet(livePreviewContextFacet) !==
        tr.state.facet(livePreviewContextFacet);
      const shouldRebuild =
        tr.docChanged ||
        Boolean(tr.selection) ||
        contextChanged ||
        options.rebuildOn?.(tr) === true;

      if (shouldRebuild) {
        return options.create(tr.state);
      }
      if (options.mapWhenIdle === false) {
        return deco;
      }
      return deco.map(tr.changes);
    },
    provide: (value) => [
      EditorView.decorations.from(value),
      EditorView.atomicRanges.of((view) => view.state.field(value)),
    ],
  });
  return field;
}
