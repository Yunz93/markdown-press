import type {
  ChangeDesc,
  EditorState,
  Extension,
  Transaction,
} from "@codemirror/state";
import { StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
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
  cacheKey = markdown,
): string {
  const cached = inlineHtmlCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const html = render(markdown);
  inlineHtmlCache.set(cacheKey, html);
  return html;
}

export interface CoverageRange {
  from: number;
  to: number;
}

/** Result of a block decoration build: widgets plus candidate coverage for selection gating. */
export interface BlockDecorationBuild {
  decorations: DecorationSet;
  /**
   * All candidate block ranges from the last scan (including selection-suppressed
   * holes). Selection only rebuilds when enter/leave these ranges.
   */
  coverage: readonly CoverageRange[];
}

export function normalizeBlockDecorationBuild(
  result: BlockDecorationBuild | DecorationSet,
): BlockDecorationBuild {
  if (result && typeof result === "object" && "decorations" in result) {
    return result;
  }
  const decorations = result as DecorationSet;
  const coverage: CoverageRange[] = [];
  decorations.between(0, 1e9, (from, to) => {
    coverage.push({ from, to });
  });
  return { decorations, coverage };
}

/** True when selection enter/leave any coverage range (holes + active widgets). */
export function selectionAffectsCoverage(
  startState: EditorState,
  state: EditorState,
  coverage: readonly CoverageRange[],
): boolean {
  for (const range of coverage) {
    const was = selectionTouchesRange(startState, range.from, range.to);
    const now = selectionTouchesRange(state, range.from, range.to);
    if (was !== now) return true;
  }
  return false;
}

function mapCoverage(
  coverage: readonly CoverageRange[],
  changes: ChangeDesc,
): CoverageRange[] {
  const next: CoverageRange[] = [];
  for (const range of coverage) {
    try {
      const from = changes.mapPos(range.from, 1);
      const to = changes.mapPos(range.to, -1);
      if (from < to) next.push({ from, to });
    } catch {
      // Drop ranges that cannot be mapped.
    }
  }
  return next;
}

/**
 * Collect changed document ranges after a transaction (new-doc coordinates).
 * Used for incremental block re-analysis.
 */
export function collectChangedRanges(
  tr: Transaction,
  pad = 0,
): CoverageRange[] {
  if (!tr.docChanged) return [];
  const ranges: CoverageRange[] = [];
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    ranges.push({
      from: Math.max(0, fromB - pad),
      to: Math.min(tr.state.doc.length, toB + pad),
    });
  });
  return mergeCoverageRanges(ranges);
}

export function mergeCoverageRanges(
  ranges: readonly CoverageRange[],
): CoverageRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const out: CoverageRange[] = [{ ...sorted[0]! }];
  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const last = out[out.length - 1]!;
    if (cur.from <= last.to) {
      last.to = Math.max(last.to, cur.to);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Expand changed ranges to whole paragraph / blank-line-delimited blocks.
 */
export function expandRangesToBlocks(
  state: EditorState,
  ranges: readonly CoverageRange[],
): CoverageRange[] {
  const expanded: CoverageRange[] = [];
  for (const range of ranges) {
    let from = range.from;
    let to = range.to;
    try {
      let line = state.doc.lineAt(from);
      while (line.number > 1) {
        const prev = state.doc.line(line.number - 1);
        if (!prev.text.trim()) break;
        line = prev;
      }
      from = line.from;

      line = state.doc.lineAt(Math.max(from, Math.min(to, state.doc.length)));
      while (line.number < state.doc.lines) {
        const next = state.doc.line(line.number + 1);
        if (!next.text.trim()) break;
        line = next;
      }
      to = line.to;
    } catch {
      // keep original
    }
    expanded.push({ from, to });
  }
  return mergeCoverageRanges(expanded);
}

/**
 * CodeMirror forbids `block: true` decorations from ViewPlugins.
 * Provide them from a StateField instead (same pattern as Live Preview tables).
 *
 * Rebuild policy:
 * - Document / context / rebuildOn → full create.
 * - Selection → only when caret enters or leaves a coverage range (no same-line thrash).
 * - Otherwise → map decorations through changes.
 */
export function defineLivePreviewBlockDecorationField(options: {
  create: (state: EditorState) => BlockDecorationBuild | DecorationSet;
  /** Extra rebuild triggers (async resolve effects, etc.). */
  rebuildOn?: (tr: Transaction) => boolean;
  /** Map through changes when not rebuilding (default true). */
  mapWhenIdle?: boolean;
}): Extension {
  const field = StateField.define<BlockDecorationBuild>({
    create(state) {
      return normalizeBlockDecorationBuild(options.create(state));
    },
    update(value, tr) {
      const contextChanged =
        tr.startState.facet(livePreviewContextFacet) !==
        tr.state.facet(livePreviewContextFacet);
      const forced =
        contextChanged || options.rebuildOn?.(tr) === true || tr.docChanged;

      if (forced) {
        return normalizeBlockDecorationBuild(options.create(tr.state));
      }

      if (tr.selection) {
        if (selectionAffectsCoverage(tr.startState, tr.state, value.coverage)) {
          return normalizeBlockDecorationBuild(options.create(tr.state));
        }
        return value;
      }

      if (options.mapWhenIdle === false) {
        return value;
      }

      return {
        decorations: value.decorations.map(tr.changes),
        coverage: mapCoverage(value.coverage, tr.changes),
      };
    },
    provide: (value) => [
      EditorView.decorations.from(value, (v) => v.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(value).decorations),
    ],
  });
  return field;
}

/** Empty block build helper. */
export function emptyBlockDecorationBuild(): BlockDecorationBuild {
  return { decorations: Decoration.none, coverage: [] };
}
