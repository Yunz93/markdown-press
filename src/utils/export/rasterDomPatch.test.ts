/** @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import { patchExportDomForHtml2Canvas, splitInlineCodeForRaster } from './rasterDomPatch';

describe('splitInlineCodeForRaster', () => {
  it('splits on whitespace and keeps spaces as tokens', () => {
    expect(splitInlineCodeForRaster('%% 不显示的正文 %%')).toEqual([
      '%',
      '%',
      ' ',
      '不',
      '显',
      '示',
      '的',
      '正',
      '文',
      ' ',
      '%',
      '%',
    ]);
  });

  it('keeps ASCII tokens intact', () => {
    expect(splitInlineCodeForRaster('foo bar')).toEqual(['foo', ' ', 'bar']);
  });
});

describe('patchExportDomForHtml2Canvas', () => {
  it('wraps inline code in raster chunks and marks lists', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <article class="markdown-body">
        <ul>
          <li><p><strong>注释</strong>：<code>%% 不显示的正文 %%</code></p></li>
        </ul>
        <pre><code>keep block</code></pre>
      </article>
    `;

    patchExportDomForHtml2Canvas(root);

    const inlineCode = root.querySelector('li code')!;
    expect(inlineCode.classList.contains('mp-export-raster-code')).toBe(true);
    expect(inlineCode.querySelectorAll('.mp-export-raster-code-chunk').length).toBeGreaterThan(1);
    expect(inlineCode.textContent).toBe('%% 不显示的正文 %%');

    const blockCode = root.querySelector('pre code')!;
    expect(blockCode.classList.contains('mp-export-raster-code')).toBe(false);
    expect(blockCode.querySelector('.mp-export-raster-code-chunk')).toBeNull();

    expect(root.querySelector('ul')?.classList.contains('mp-export-raster-list')).toBe(true);
  });
});
