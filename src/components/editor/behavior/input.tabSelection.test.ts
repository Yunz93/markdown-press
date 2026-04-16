import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import type { StateCommand } from '@codemirror/state';
import { createHandleSmartTab } from './input';
import { handleListTab } from '../nestedListCommands';

function applyCommand(cmd: StateCommand, doc: string, anchor: number, head: number): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
  let next = state;
  cmd({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  return next;
}

describe('createHandleSmartTab selection', () => {
  const tab = createHandleSmartTab('strict');

  it('indents each covered line when a paragraph selection is non-empty', () => {
    const next = applyCommand(tab, 'aa\nbb\ncc', 0, 8);
    expect(next.doc.toString()).toBe('    aa\n    bb\n    cc');
  });

  it('indents the full line when only part of a line is selected', () => {
    const next = applyCommand(tab, 'hello world', 0, 5);
    expect(next.doc.toString()).toBe('    hello world');
  });
});

describe('handleListTab selection fallback', () => {
  it('indents each line when there is a selection but no parsed list items', () => {
    const next = applyCommand(handleListTab({ strictMode: true }), 'aa\nbb', 0, 5);
    expect(next.doc.toString()).toBe('    aa\n    bb');
  });
});
