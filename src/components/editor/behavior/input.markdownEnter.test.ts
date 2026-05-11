import { describe, expect, it } from 'vitest';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState, EditorSelection } from '@codemirror/state';
import type { StateCommand } from '@codemirror/state';
import { handleSmartEnter } from './input';

function applyWithMarkdown(cmd: StateCommand, doc: string, anchor: number, head: number): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
    extensions: [markdown()],
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

describe('handleSmartEnter ordered list continuation with markdown syntax tree', () => {
  it('does not wipe indented continuation text when pressing Enter at line end', () => {
    const doc = '1. 介绍研发项目经验\n   非常';
    const next = applyWithMarkdown(handleSmartEnter, doc, doc.length, doc.length);
    expect(next.doc.toString()).toContain('非常');
  });

  it('still inserts next ordered marker after continuation (ordered parent)', () => {
    const doc = '1. one\n   note';
    const next = applyWithMarkdown(handleSmartEnter, doc, doc.length, doc.length);
    expect(next.doc.toString()).toContain('note');
    expect(next.doc.toString()).toMatch(/\n2\.[ )]/);
  });
});
