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

  it('does not insert a blank line between a parent list item and a nested list item', () => {
    const input = ['- UI', '    - child one', '    - child two', ''].join('\n');
    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out.trimEnd()).toBe('- UI\n    - child one\n    - child two');
  });

  it('renumbers indented ordered list items during format-on-save', () => {
    const input = ['10. parent', '    3. child one', '    9. child two', '11. next', ''].join('\n');
    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out.trimEnd()).toBe('1. parent\n    1. child one\n    2. child two\n2. next');
  });

  it('preserves indented code lines that look like ordered lists', () => {
    const input = ['before', '', '    1. not a list', '    2. still code', '', 'after', ''].join('\n');
    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out).toContain('    1. not a list\n    2. still code');
  });

  it('renumbers ordered lists inside blockquotes during format-on-save', () => {
    const input = ['> 1. quote one', '> 3. quote two', '', '1. root', ''].join('\n');
    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out.trimEnd()).toBe('> 1. quote one\n> 2. quote two\n\n1. root');
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
