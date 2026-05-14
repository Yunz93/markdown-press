import { describe, it, expect } from 'vitest';
import { getMarkdownListHangPrefixCharCount } from './core';

describe('getMarkdownListHangPrefixCharCount', () => {
  it('covers ordered list marker and following space', () => {
    expect(getMarkdownListHangPrefixCharCount('3. 是不是')).toBe(3);
    expect(getMarkdownListHangPrefixCharCount('10. 正文')).toBe(4);
  });

  it('covers task list checkbox prefix', () => {
    expect(getMarkdownListHangPrefixCharCount('- [ ] 待办')).toBe(6);
    expect(getMarkdownListHangPrefixCharCount('- [x] 完成')).toBe(6);
  });

  it('returns null for non-list lines', () => {
    expect(getMarkdownListHangPrefixCharCount('### 标题')).toBeNull();
    expect(getMarkdownListHangPrefixCharCount('> 1. 引用里')).toBeNull();
  });
});
