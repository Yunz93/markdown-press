/** @vitest-environment happy-dom */

import { describe, it, expect } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { markdownFencedCodeInputHandler } from './fencedCodeInput';

function viewAt(doc: string, pos: number): EditorView {
  const parent = document.createElement('div');
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: pos },
      extensions: [markdown({ codeLanguages: () => null })],
    }),
    parent,
  });
}

describe('markdownFencedCodeInputHandler', () => {
  it('expands ``` on an empty line to a full fence and places the caret after the opening fence', () => {
    const doc = '``';
    const view = viewAt(doc, 2);
    expect(markdownFencedCodeInputHandler(view, 2, 2, '`')).toBe(true);
    expect(view.state.doc.toString()).toBe('```\n\n```');
    expect(view.state.selection.main.head).toBe(3);
  });

  it('does not expand the third backtick when closing an existing fence', () => {
    const doc = '```js\nx\n``';
    const view = viewAt(doc, doc.length);
    expect(markdownFencedCodeInputHandler(view, doc.length, doc.length, '`')).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});
