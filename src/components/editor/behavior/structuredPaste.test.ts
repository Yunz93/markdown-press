/** @vitest-environment happy-dom */

import { describe, it, expect } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { handleStructuredPaste } from './input';

function viewWithDoc(doc: string, anchor: number, head?: number): EditorView {
  const parent = document.createElement('div');
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor, head: head ?? anchor },
    }),
    parent,
  });
}

function pasteEvent(text: string): ClipboardEvent {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  return new ClipboardEvent('paste', { clipboardData: data as unknown as DataTransfer });
}

describe('handleStructuredPaste', () => {
  it('turns a bare URL paste into [](url) with caret inside brackets', () => {
    const view = viewWithDoc('hello ', 6);
    const ev = pasteEvent('https://example.com/path');
    expect(handleStructuredPaste(view, ev)).toBe(true);
    expect(view.state.doc.toString()).toBe('hello [](https://example.com/path)');
    expect(view.state.selection.main.head).toBe(7);
  });

  it('wraps selection when pasting a URL', () => {
    const doc = 'link text';
    const view = viewWithDoc(doc, 0, doc.length);
    const ev = pasteEvent('https://a.test');
    expect(handleStructuredPaste(view, ev)).toBe(true);
    expect(view.state.doc.toString()).toBe('[link text](https://a.test)');
  });

  it('does not rewrite URL paste inside fenced code', () => {
    const doc = '```\n\n```';
    const view = viewWithDoc(doc, 4);
    const ev = pasteEvent('https://example.com');
    expect(handleStructuredPaste(view, ev)).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});
