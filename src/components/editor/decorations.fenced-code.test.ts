/** @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { fencedCodeDecorations, markdownHighlightStyle, markdownListDecorations } from './decorations';
import { resolveEditorCodeLanguage } from '../../utils/editorCodeLanguages';

function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);

  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ codeLanguages: resolveEditorCodeLanguage }),
        fencedCodeDecorations,
        syntaxHighlighting(markdownHighlightStyle),
      ],
    }),
    parent,
  });
}

describe('fencedCodeDecorations', () => {
  it('marks existing fenced code lines on initial render', () => {
    const view = createView('```java\nclass A {}\n```');

    const lines = Array.from(view.dom.querySelectorAll('.cm-line'));
    expect(lines.some((line) => line.classList.contains('cm-fenced-code-line-start'))).toBe(true);
    expect(lines.some((line) => line.classList.contains('cm-fenced-code-line-body'))).toBe(true);
    expect(lines.some((line) => line.classList.contains('cm-fenced-code-line-end'))).toBe(true);

    view.destroy();
  });
});

describe('markdownListDecorations', () => {
  it('does not draw indentation guide lines for nested lists', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '1. parent\n   1. child\n      1. grandchild',
        extensions: [markdownListDecorations],
      }),
      parent: document.createElement('div'),
    });

    expect(view.dom.querySelector('.cm-markdown-list-line')).toBeNull();
    expect(view.dom.querySelector('.cm-markdown-list-marker')).not.toBeNull();

    view.destroy();
  });
});
