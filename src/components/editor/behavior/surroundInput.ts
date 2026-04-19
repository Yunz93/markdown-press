/**
 * Intercept printable input when there is a non-empty selection so Markdown
 * delimiters wrap the selection instead of replacing it (common editor UX).
 */

import type { EditorView } from '@codemirror/view';
import { isInsideFencedCode, isInsideFrontmatter, unwrapInline } from './core';
import { insertLink } from './commands/inline';

export function markdownSelectionSurroundInputHandler(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  if (from >= to) return false;

  const state = view.state;
  const ranges = state.selection.ranges;
  if (ranges.length !== 1 || ranges[0].from !== from || ranges[0].to !== to) {
    return false;
  }

  if (isInsideFencedCode(state, from) || isInsideFrontmatter(state, from)) {
    return false;
  }

  if (text === '**') {
    unwrapInline(state, view.dispatch, '**', '**');
    return true;
  }

  if (text === '*') {
    unwrapInline(state, view.dispatch, '*', '*');
    return true;
  }

  if (text === '`') {
    unwrapInline(state, view.dispatch, '`', '`');
    return true;
  }

  if (text === '~~') {
    unwrapInline(state, view.dispatch, '~~', '~~');
    return true;
  }

  if (text === '[') {
    insertLink({ state, dispatch: view.dispatch });
    return true;
  }

  return false;
}
