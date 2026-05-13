import { describe, it, expect } from 'vitest';
import { buildExportStyles } from './styles';

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

  it('tightens li > p margins like preview (avoids misaligned html2canvas list markers)', () => {
    const css = buildExportStyles('light');
    expect(css).toMatch(/\.export-document \.markdown-body li > p\s*\{[^}]*margin-top:\s*0\.15em/m);
  });

  it('draws del and s with a background line in raster-safe export mode', () => {
    const css = buildExportStyles('light', undefined, undefined, '', undefined, undefined, 'nord', 'raster-safe');
    expect(css).toMatch(/\.export-document \.markdown-body del\s*,\s*\.export-document \.markdown-body s\s*\{[^}]*text-decoration:\s*none/m);
    expect(css).toMatch(/\.export-document \.markdown-body del\s*,\s*\.export-document \.markdown-body s\s*\{[^}]*background-image:\s*linear-gradient\(currentColor,\s*currentColor\)/m);
    expect(css).toMatch(/\.export-document \.markdown-body del\s*,\s*\.export-document \.markdown-body s\s*\{[^}]*background-position:\s*0 66%/m);
  });

  it('draws del and s with native line-through in preview-native export mode (default)', () => {
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
});
