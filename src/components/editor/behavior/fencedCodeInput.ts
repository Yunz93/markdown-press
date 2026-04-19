/**
 * When typing the third backtick of ``` at line start, inserts a complete fenced
 * block shell and opens language completion.
 */

import { startCompletion } from '@codemirror/autocomplete';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isInsideFencedCode, isInsideFrontmatter } from './core';
import { markdownSelectionSurroundInputHandler } from './surroundInput';

const FENCE_BLOCK = '```\n\n```';

function tryExpandTripleBacktickFence(view: EditorView, from: number, to: number, text: string): boolean {
  if (from !== to || text !== '`') {
    return false;
  }

  const state = view.state;
  if (isInsideFencedCode(state, from) || isInsideFrontmatter(state, from)) {
    return false;
  }

  const line = state.doc.lineAt(from);
  const prefix = state.doc.sliceString(line.from, from);
  if (!/^[ \t]{0,3}``$/.test(prefix)) {
    return false;
  }

  const start = from - 2;
  view.dispatch({
    changes: { from: start, to: from, insert: FENCE_BLOCK },
    selection: EditorSelection.cursor(start + 3),
    scrollIntoView: true,
    userEvent: 'input',
  });
  queueMicrotask(() => {
    startCompletion(view);
  });
  return true;
}

export function markdownFencedCodeInputHandler(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  if (markdownSelectionSurroundInputHandler(view, from, to, text)) {
    return true;
  }
  return tryExpandTripleBacktickFence(view, from, to, text);
}
