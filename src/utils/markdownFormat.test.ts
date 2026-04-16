import { describe, expect, it } from 'vitest';
import { formatMarkdownForSave } from './markdownFormat';

describe('formatMarkdownForSave', () => {
  it('unwraps a single pasted indented line between paragraph lines so it is not an indented code block', () => {
    const input = [
      'void main()',
      '{',
      '',
      '    printf("Hello, Markdown.");',
      '',
      '}',
      '',
    ].join('\n');

    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out).toContain('printf("Hello, Markdown.");');
    expect(out).not.toMatch(/\n {4}printf/);
  });

  it('preserves contiguous indented lines as an indented code block', () => {
    const input = ['before', '', '    a', '    b', '', 'after', ''].join('\n');
    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out).toMatch(/\n {4}a\n {4}b\n/);
  });

  it('strips one tab indent for an orphan indented line', () => {
    const input = ['text', '\tcode line', 'text', ''].join('\n');
    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out).toContain('code line');
    expect(out).not.toContain('\tcode line');
  });

  it('joins pipe table rows and normalizes Unicode dashes in separator rows', () => {
    const input = [
      '| 左对齐 | 居中 | 右对齐 |',
      '',
      '| ------- | ----- | — |',
      '',
      '| L | C | 1.0 |',
      '',
    ].join('\n');

    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out).toContain('| 左对齐 | 居中 | 右对齐 |');
    expect(out).toContain('| ------- | ----- | - |');
    expect(out).toContain('| L | C | 1.0 |');
    const lines = out.trimEnd().split('\n');
    const iHeader = lines.findIndex((l) => l.includes('左对齐'));
    const iSep = lines.findIndex((l) => l.includes('| -------'));
    const iData = lines.findIndex((l) => l.includes('| L |'));
    expect(iSep).toBe(iHeader + 1);
    expect(iData).toBe(iSep + 1);
  });
});
