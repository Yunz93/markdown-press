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
});
