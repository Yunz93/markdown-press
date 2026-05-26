import { describe, it, expect } from 'vitest';
import { buildExportDocument, buildExportStyles } from './styles';

describe('buildExportStyles', () => {
  it('removes github-markdown h2 bottom border in export body', () => {
    const css = buildExportStyles('light');
    expect(css).toMatch(/\.export-document \.markdown-body h2\s*\{[^}]*border-bottom:\s*none/m);
  });

  it('includes explicit list markers for export body (matches preview pane)', () => {
    const css = buildExportStyles('light');
    expect(css).toContain('.export-document .markdown-body ul');
    expect(css).toMatch(/\.export-document \.markdown-body ul\s*\{[^}]*list-style:\s*disc/m);
    expect(css).toMatch(/\.export-document \.markdown-body ol\s*\{[^}]*list-style:\s*decimal/m);
  });

  it('gives nested lists enough padding-left so guide border does not overlap ol markers', () => {
    const css = buildExportStyles('light');
    expect(css).toMatch(
      /\.export-document \.markdown-body li > ul\s*,\s*\.export-document \.markdown-body li > ol\s*\{[^}]*padding-left:\s*2rem/m,
    );
  });

  it('tightens li > p margins like preview (avoids misaligned html2canvas list markers)', () => {
    const css = buildExportStyles('light');
    expect(css).toMatch(/\.export-document \.markdown-body li > p\s*\{[^}]*margin-top:\s*0\.15em/m);
    expect(css).toMatch(/\.mp-export-raster-list li > p:first-child\s*\{[^}]*display:\s*inline/m);
    expect(css).toMatch(/list-style-position:\s*inside/);
  });

  it('includes raster inline-code chunk styles for html2canvas', () => {
    const css = buildExportStyles('light');
    expect(css).toMatch(/\.mp-export-raster-code-chunk\s*\{[^}]*background:\s*var\(--mp-doc-code-bg\)/m);
    expect(css).toMatch(/code\.mp-export-raster-code\s*\{[^}]*background:\s*transparent/m);
  });

  it('draws del and s with native line-through like preview', () => {
    const css = buildExportStyles('light');
    expect(css).toMatch(/\.export-document \.markdown-body del\s*,\s*\.export-document \.markdown-body s\s*\{[^}]*text-decoration:\s*line-through/m);
    const delBlock = css.match(/\.export-document \.markdown-body del\s*,\s*\.export-document \.markdown-body s\s*\{[^}]*\}/);
    expect(delBlock?.[0]).toBeDefined();
    expect(delBlock![0]).not.toContain('linear-gradient');
  });

  it('draws ins and u with a background line instead of html2canvas text-decoration', () => {
    const css = buildExportStyles('light');
    expect(css).toMatch(/\.export-document \.markdown-body ins\s*,\s*\.export-document \.markdown-body u\s*\{[^}]*text-decoration:\s*none/m);
    expect(css).toMatch(/\.export-document \.markdown-body ins\s*,\s*\.export-document \.markdown-body u\s*\{[^}]*background-image:\s*linear-gradient\(currentColor,\s*currentColor\)/m);
    expect(css).toMatch(/\.export-document \.markdown-body ins\s*,\s*\.export-document \.markdown-body u\s*\{[^}]*background-position:\s*0 88%/m);
  });

  it('scopes export theme colors to .export-document[data-theme] for off-screen rasterization', () => {
    const css = buildExportStyles('light');
    expect(css).toMatch(/\.export-document\[data-theme="light"\] \.markdown-body\s*\{[^}]*--color-fg-default:\s*var\(--mp-doc-text\)/m);
    expect(css).toMatch(/\.export-document\[data-theme="dark"\] \.markdown-body\s*\{[^}]*--color-fg-default:\s*var\(--mp-doc-text\)/m);
    expect(css).toMatch(/\.export-document \{\s*[^}]*--mp-doc-text:/m);
    expect(css).not.toMatch(/html\.dark \.export-document/);
    expect(css).not.toMatch(/html:not\(\.dark\) \.export-document/);
  });

  it('embeds export theme on .export-document for raster selectors', () => {
    const markup = buildExportDocument('<p>Hi</p>', '', 'nord', 'dark');
    expect(markup).toContain('data-theme="dark"');
  });
});
