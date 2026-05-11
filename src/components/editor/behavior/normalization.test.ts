import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { getStrictOrderedListNormalizationChanges } from './normalization';

function normalize(doc: string): string {
  const state = EditorState.create({ doc });
  const changes = getStrictOrderedListNormalizationChanges(state);
  if (!changes) return doc;
  return state.update({ changes }).state.doc.toString();
}

describe('getStrictOrderedListNormalizationChanges', () => {
  it('renumbers ordered lists inside blockquotes', () => {
    expect(normalize('> 1. one\n> 3. two')).toBe('> 1. one\n> 2. two');
  });

  it('keeps blockquote and root ordered lists in separate numbering contexts', () => {
    expect(normalize('1. root\n> 1. quote\n2. next root')).toBe('1. root\n> 1. quote\n2. next root');
  });

  it('does not restart numbering after an indented continuation paragraph under an ordered item', () => {
    expect(normalize('1. one\n\tcontinuation\n2. two')).toBe('1. one\n\tcontinuation\n2. two');
  });

  it('renumbers a decimal marker to match alphabetic siblings (A. B. → C.)', () => {
    expect(normalize('A. one\nB. two\n1. three')).toBe('A. one\nB. two\nC. three');
  });

  it('rewrites a correct numeric index to letters when the list uses letters', () => {
    expect(normalize('A. one\nB. two\n3. three')).toBe('A. one\nB. two\nC. three');
  });

  it('does not rewrite a new decimal list after a paragraph break', () => {
    expect(normalize('A. one\nB. two\n\nParagraph\n\n1. three')).toBe('A. one\nB. two\n\nParagraph\n\n1. three');
  });
});
