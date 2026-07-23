import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import type { ViewUpdate } from "@codemirror/view";
import { WIKI_LINK_REGEX } from "../../../utils/markdownLinkUtils";
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
