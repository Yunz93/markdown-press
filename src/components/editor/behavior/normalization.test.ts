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

  // 回归：空行 + 显式起始 marker 1. 应当被视作新分组，不应该继续上一段编号
  it('restarts numbering when a blank-separated group begins with marker 1', () => {
    expect(normalize('1. a\n2. b\n\n1. c')).toBe('1. a\n2. b\n\n1. c');
  });

  // 回归：空行 + 非起始 marker（如 2.） 视为同段延续，沿用计数
  it('continues numbering when blank-separated next marker is not 1', () => {
    expect(normalize('1. a\n2. b\n\n2. c')).toBe('1. a\n2. b\n\n3. c');
  });

  // 回归 #3：父项 marker 内容起列 > 子项缩进时，子项不应被并入父项的嵌套计数
  it('does not nest a child whose indent is below the parent marker content column', () => {
    // 1. a 内容起列=3；2 空格不足以构成 a 的子项 → b/c 应当独立成组
    expect(normalize('1. a\n  1. b\n  2. c')).toBe('1. a\n  1. b\n  2. c');
  });

  it('keeps a properly indented child under its multi-digit parent', () => {
    // 100. parent 内容起列=5；子项 1.,2. 应被正确识别为 parent 的嵌套层
    const out = normalize('100. parent\n     1. child\n     2. child2');
    expect(out).toBe('100. parent\n     1. child\n     2. child2');
  });

  // 回归 #5：顶层组首项 number 不应被强制改为 1，应当作为起算锚点
  it('preserves the first top-level marker as an anchor (does not reset to 1)', () => {
    expect(normalize('100. parent\n1. child')).toBe('100. parent\n101. child');
  });

  it('preserves user-chosen starting number for a top-level group', () => {
    expect(normalize('5. a\n8. b\n9. c')).toBe('5. a\n6. b\n7. c');
  });

  // 回归 #10：同级无序项打断 marker style 跨组继承
  it('does not inherit ordered marker style across a sibling unordered item', () => {
    // 用户在 `A. a` 后写了一个无序兄弟，然后再写 `1. c`：
    // c 不应当被强制改成 `B. c`，因为中间已被无序项分隔成不同列表块
    expect(normalize('A. a\n- b\n1. c')).toBe('A. a\n- b\n1. c');
  });

  it('continues to inherit ordered style across a deeper unordered child', () => {
    // 嵌套的无序子项不应打断顶层 ordered 的样式推断
    expect(normalize('A. a\n  - x\n  - y\n1. c')).toBe('A. a\n  - x\n  - y\nB. c');
  });

  it('renumbers lower-case roman siblings to stay contiguous', () => {
    expect(normalize('ii. two\niv. four')).toBe('ii. two\niii. four');
  });
});
