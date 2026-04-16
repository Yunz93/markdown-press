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
});
