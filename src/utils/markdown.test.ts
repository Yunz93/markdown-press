/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach } from 'vitest';
import { clearMarkdownCache, renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  beforeEach(() => {
    clearMarkdownCache();
  });

  it('renders wikilink anchor with data-wikilink', () => {
    const html = renderMarkdown('See [[My Note|label]].');
    expect(html).toContain('data-wikilink');
    expect(html).toContain('markdown-wikilink');
    expect(html).toMatch(/My Note/i);
  });

  it('renders inline KaTeX and preserves structure after DOMPurify', () => {
    const html = renderMarkdown('Formula $x^2 + y^2 = z^2$ end.');
    expect(html).toContain('katex');
    expect(html).toMatch(/class="mord mathnormal">x</);
    expect(html).toContain('mrel');
  });

  it('renders display math in katex-display wrapper', () => {
    const html = renderMarkdown('$$\na + b\n$$');
    expect(html).toContain('katex-display');
    expect(html).toContain('katex');
  });

  it('consumes multiline $$ blocks so LaTeX is not escaped as paragraph text', () => {
    const md = [
      '极限与级数：',
      '',
      '$$',
      String.raw`\lim_{n \to \infty} \frac{1}{n} = 0,`,
      String.raw`\qquad`,
      String.raw`\sum_{k=1}^{\infty} \frac{1}{2^k} = 1`,
      '$$',
      '',
      '```mermaid',
      'flowchart LR',
      '  A-->B',
      '```',
    ].join('\n');
    const html = renderMarkdown(md);
    expect(html).toContain('katex-display');
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('flowchart LR');
    expect(html).not.toContain('<p>\\ lim');
    expect(html).not.toContain('<p>\\qquad</p>');
  });

  it('renders mermaid fence as .mermaid placeholder with diagram source', () => {
    const html = renderMarkdown('```mermaid\nflowchart TD\n  A-->B\n```');
    expect(html).toContain('class="mermaid"');
    expect(html).toContain('flowchart TD');
    // DOMPurify escapes `>` inside the placeholder text; Mermaid still receives decoded source at render time.
    expect(html).toMatch(/A--(&gt;|>)B/);
  });

  it('renders task list markup', () => {
    const html = renderMarkdown('- [ ] open\n- [x] closed');
    expect(html).toContain('task-list-item');
  });

  it('renders GFM/Obsidian footnotes as superscript refs and a footnotes section', () => {
    const md = 'Text[^a] end.\n\n[^a]: https://example.com/doc';
    const html = renderMarkdown(md);
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('<sup class="footnote-ref"');
    expect(html).toContain('href="#fn');
    expect(html).toContain('class="footnotes"');
    expect(html).toContain('example.com/doc');
  });

  it('maps standalone block id paragraph to data-block-id on previous block', () => {
    const html = renderMarkdown('Hello\n\n^my-id\n');
    expect(html).toContain('data-block-id="my-id"');
  });

  it('renders GFM tables with blank lines between rows and Unicode dash separator', () => {
    const md = [
      '| 左对齐 | 居中 | 右对齐 |',
      '',
      '| ------- | ----- | — |',
      '',
      '| L | C | 1.0 |',
      '',
    ].join('\n');
    const html = renderMarkdown(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
  });
});
