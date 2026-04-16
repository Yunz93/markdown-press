/** @vitest-environment happy-dom */

import { describe, it, expect } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdownSelectionSurroundInputHandler } from './surroundInput';

function viewWithSelection(doc: string, anchor: number, head: number): EditorView {
  const parent = document.createElement('div');
  return new EditorView({
    state: EditorState.create({ doc, selection: { anchor, head } }),
    parent,
  });
}

describe('markdownSelectionSurroundInputHandler', () => {
  it('wraps selection with ** instead of replacing', () => {
    const view = viewWithSelection('hi', 0, 2);
    expect(markdownSelectionSurroundInputHandler(view, 0, 2, '**')).toBe(true);
    expect(view.state.doc.toString()).toBe('**hi**');
  });

  it('wraps with * for emphasis', () => {
    const view = viewWithSelection('x', 0, 1);
    expect(markdownSelectionSurroundInputHandler(view, 0, 1, '*')).toBe(true);
    expect(view.state.doc.toString()).toBe('*x*');
  });

  it('does not wrap inside fenced code', () => {
    const doc = '```\ncode\n```';
    const from = doc.indexOf('ode');
    const to = from + 3;
    const view = viewWithSelection(doc, from, to);
    expect(markdownSelectionSurroundInputHandler(view, from, to, '*')).toBe(false);
  });
});
