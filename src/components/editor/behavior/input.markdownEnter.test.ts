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

  it('continues upper-case alphabetic ordered lists with the next letter', () => {
    const doc = 'A. first line';
    const next = applyWithMarkdown(handleSmartEnter, doc, doc.length, doc.length);
    expect(next.doc.toString()).toMatch(/\nB\.[ )]/);
  });

  // 回归 #2：缩进不足 CommonMark 续行宽度时不应当作续行段
  it('does not insert next ordered marker when continuation indent is below marker width', () => {
    const doc = '1. one\n two';
    const next = applyWithMarkdown(handleSmartEnter, doc, doc.length, doc.length);
    // 续行段判定失败 → 落到默认 markdown 续行（不会插入下一个有序 marker）
    expect(next.doc.toString()).not.toMatch(/\n2\.[ )]/);
  });

  it('does not insert next ordered marker when continuation indent is 2 spaces under 1.', () => {
    const doc = '1. one\n  two';
    const next = applyWithMarkdown(handleSmartEnter, doc, doc.length, doc.length);
    expect(next.doc.toString()).not.toMatch(/\n2\.[ )]/);
  });

  it('continues lower-case roman ordered lists with the next numeral', () => {
    const doc = 'ii. second item';
    const next = applyWithMarkdown(handleSmartEnter, doc, doc.length, doc.length);
    expect(next.doc.toString()).toMatch(/\niii\.[ )]/);
  });

  it('continues upper-case roman ordered lists with the next numeral', () => {
    const doc = 'IV. fourth item';
    const next = applyWithMarkdown(handleSmartEnter, doc, doc.length, doc.length);
    expect(next.doc.toString()).toMatch(/\nV\.[ )]/);
  });
});
