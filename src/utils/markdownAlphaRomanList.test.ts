import { describe, expect, it } from 'vitest';
import { preprocessAlphaRomanLists } from './markdownAlphaRomanList';

describe('preprocessAlphaRomanLists', () => {
  it('rewrites uppercase alpha markers and records type=A', () => {
    const { src, meta } = preprocessAlphaRomanLists('A. test\nB. test');
    expect(src).toBe('1. test\n2. test');
    expect(meta.get(0)).toEqual({ type: 'A', start: 1 });
    expect(meta.get(1)).toEqual({ type: 'A', start: 2 });
  });

  it('rewrites lowercase alpha markers and records type=a', () => {
    const { src, meta } = preprocessAlphaRomanLists('a. foo\nb. bar');
    expect(src).toBe('1. foo\n2. bar');
    expect(meta.get(0)).toEqual({ type: 'a', start: 1 });
    expect(meta.get(1)).toEqual({ type: 'a', start: 2 });
  });

  it('treats multi-letter roman markers as roman regardless of overlap with alpha letters', () => {
    const { src, meta } = preprocessAlphaRomanLists('ii. first\niii. second\niv. third');
    expect(src).toBe('2. first\n3. second\n4. third');
    expect(meta.get(0)).toEqual({ type: 'i', start: 2 });
    expect(meta.get(1)).toEqual({ type: 'i', start: 3 });
    expect(meta.get(2)).toEqual({ type: 'i', start: 4 });
  });

  it('single-letter `i.` is classified as alpha (i=9), not roman', () => {
    // 与编辑器侧 inferOrderedMarkerStyleFromRawPart 一致:单字母按 alpha 处理。
    const { meta } = preprocessAlphaRomanLists('i. test');
    expect(meta.get(0)).toEqual({ type: 'a', start: 9 });
  });

  it('keeps numeric markers untouched and does not register them in meta', () => {
    const { src, meta } = preprocessAlphaRomanLists('1. one\n2. two');
    expect(src).toBe('1. one\n2. two');
    expect(meta.size).toBe(0);
  });

  it('supports `)` as marker delimiter', () => {
    const { src, meta } = preprocessAlphaRomanLists('A) item1\nB) item2');
    expect(src).toBe('1) item1\n2) item2');
    expect(meta.get(0)).toEqual({ type: 'A', start: 1 });
  });

  it('rewrites nested children with their own type', () => {
    const input = 'A. parent\n    a. child1\n    b. child2';
    const { src, meta } = preprocessAlphaRomanLists(input);
    expect(src).toBe('1. parent\n    1. child1\n    2. child2');
    expect(meta.get(0)).toEqual({ type: 'A', start: 1 });
    expect(meta.get(1)).toEqual({ type: 'a', start: 1 });
    expect(meta.get(2)).toEqual({ type: 'a', start: 2 });
  });

  it('skips fenced code block content (```)', () => {
    const input = ['```', 'A. not a list', 'B. also not', '```', 'A. real list'].join('\n');
    const { src, meta } = preprocessAlphaRomanLists(input);
    expect(src).toBe(['```', 'A. not a list', 'B. also not', '```', '1. real list'].join('\n'));
    expect(meta.get(1)).toBeUndefined();
    expect(meta.get(2)).toBeUndefined();
    expect(meta.get(4)).toEqual({ type: 'A', start: 1 });
  });

  it('skips fenced code block content (~~~)', () => {
    const input = ['~~~', 'A. in code', '~~~', 'A. out'].join('\n');
    const { src } = preprocessAlphaRomanLists(input);
    expect(src).toBe(['~~~', 'A. in code', '~~~', '1. out'].join('\n'));
  });

  it('does not match marker when followed by non-space (e.g. `A.text`)', () => {
    const { src, meta } = preprocessAlphaRomanLists('A.text');
    expect(src).toBe('A.text');
    expect(meta.size).toBe(0);
  });

  it('matches marker followed only by EOL (mid-edit empty list item)', () => {
    const { src, meta } = preprocessAlphaRomanLists('A. parent\nB.');
    expect(src).toBe('1. parent\n2.');
    expect(meta.get(1)).toEqual({ type: 'A', start: 2 });
  });

  it('rejects invalid roman numerals like `xyz.`', () => {
    // y/z 不在 ivxlcdm 集合,所以不算 roman;单字母 x/y/z 走 alpha,但 `xyz` 三字母不走 alpha。
    const { src, meta } = preprocessAlphaRomanLists('xyz. nope');
    expect(src).toBe('xyz. nope');
    expect(meta.size).toBe(0);
  });

  it('handles upper-case multi-letter roman `IV`, `IX`', () => {
    const { src, meta } = preprocessAlphaRomanLists('IV. four\nIX. nine');
    expect(src).toBe('4. four\n9. nine');
    expect(meta.get(0)).toEqual({ type: 'I', start: 4 });
    expect(meta.get(1)).toEqual({ type: 'I', start: 9 });
  });

  it('reproduces the screenshot scenario layout', () => {
    const input = [
      'A. test',
      'B. test',
      '    A. test',
      '    B. test',
      '',
      'i. test',
      '    a. test',
      '    b. test',
      '        a. test',
      '        b.',
    ].join('\n');
    const { src, meta } = preprocessAlphaRomanLists(input);
    expect(src).toBe([
      '1. test',
      '2. test',
      '    1. test',
      '    2. test',
      '',
      '9. test', // 单字母 i 按 alpha 解析,字母表第 9 位
      '    1. test',
      '    2. test',
      '        1. test',
      '        2.',
    ].join('\n'));
    expect(meta.get(0)).toEqual({ type: 'A', start: 1 });
    expect(meta.get(5)).toEqual({ type: 'a', start: 9 });
    expect(meta.get(6)).toEqual({ type: 'a', start: 1 });
    expect(meta.get(8)).toEqual({ type: 'a', start: 1 });
  });
});
