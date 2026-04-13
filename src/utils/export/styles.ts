import katexCss from 'katex/dist/katex.min.css?inline';
import githubMarkdownCss from 'github-markdown-css/github-markdown.css?inline';
import { escapeHtml } from './core';
import { PREVIEW_PANEL_WIDTH_PX } from './types';
import {
  buildDynamicFontFaceCss,
  type FontSettings,
  getBundledPresetDataUrlOverrides,
} from '../fontSettings';

export async function buildExportFontFaceCss(fontSettings?: FontSettings): Promise<string> {
  if (!fontSettings) {
    return '';
  }

  const overrides = await getBundledPresetDataUrlOverrides(fontSettings);
  return buildDynamicFontFaceCss(fontSettings, overrides);
}

export function renderProperties(frontmatter: Record<string, unknown> | null): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return '';

  const rows = Object.entries(frontmatter)
    .map(([key, value]) => {
      const formattedValue = Array.isArray(value) ? value.join(', ') : String(value ?? '');
      return `
        <div class="export-properties-row">
          <div class="export-properties-key">${escapeHtml(key)}</div>
          <div class="export-properties-value">${escapeHtml(formattedValue)}</div>
        </div>
      `;
    })
    .join('');

  return `
    <section class="export-properties">
      <div class="export-properties-header">Properties</div>
      <div class="export-properties-table">${rows}</div>
    </section>
  `;
}

export function buildExportStyles(
  theme: 'light' | 'dark',
  fontFamily?: string,
  fontSize?: number,
  fontFaceCss = '',
  codeFontFamily?: string,
  codeFontSize?: number,
): string {
  const resolvedFontFamily = fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';
  const resolvedFontSize = fontSize ?? 16;
  const resolvedCodeFontFamily = codeFontFamily || '"SFMono-Regular", "JetBrains Mono", "Fira Code", "Cascadia Code", monospace';
  const resolvedCodeFontSize = codeFontSize ?? Math.max(12, resolvedFontSize - 1);

  return `
    ${fontFaceCss}
    ${githubMarkdownCss}
    ${katexCss}

    :root {
      --bg-primary: ${theme === 'dark' ? '#0d1117' : '#ffffff'};
      --bg-secondary: ${theme === 'dark' ? '#161b22' : '#f6f8fa'};
      --text-primary: ${theme === 'dark' ? '#c9d1d9' : '#24292f'};
      --text-secondary: ${theme === 'dark' ? '#8b949e' : '#57606a'};
      --border-color: ${theme === 'dark' ? '#30363d' : '#d0d7de'};
      --accent-color: ${theme === 'dark' ? '#67e8f9' : '#0f9aa8'};
      --code-bg: ${theme === 'dark' ? '#161b22' : '#f6f8fa'};
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background-color: var(--bg-primary);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .export-stage {
      min-height: 100vh;
      background: ${theme === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(249, 250, 251, 0.6)'};
      padding: 0;
    }

    .export-document {
      font-family: ${resolvedFontFamily};
      font-size: ${resolvedFontSize}px;
      line-height: 1.95;
      background-color: transparent;
      color: var(--text-primary);
      padding: 30px 28px 72px;
      max-width: ${PREVIEW_PANEL_WIDTH_PX}px;
      margin: 0 auto;
    }

    .export-document .markdown-body {
      box-sizing: border-box;
      min-width: 200px;
      max-width: 980px;
      margin: 0;
      padding: 52px 56px 72px;
      background: transparent !important;
      color: var(--text-primary);
      font-family: inherit !important;
      font-size: inherit !important;
      line-height: inherit;
    }

    html:not(.dark) .export-document .markdown-body,
    .export-document[data-theme="light"] .markdown-body {
      color: #000000 !important;
      --color-fg-default: #000000 !important;
      --color-fg-muted: #444444 !important;
      --color-canvas-default: transparent !important;
    }

    html.dark .export-document .markdown-body,
    .export-document[data-theme="dark"] .markdown-body {
      color: #c9d1d9;
      --color-canvas-default: transparent;
    }

    .export-document .markdown-body,
    .export-document .markdown-body h1,
    .export-document .markdown-body h2,
    .export-document .markdown-body h3,
    .export-document .markdown-body h4,
    .export-document .markdown-body h5,
    .export-document .markdown-body h6,
    .export-document .markdown-body p,
    .export-document .markdown-body li,
    .export-document .markdown-body td,
    .export-document .markdown-body th,
    .export-document .markdown-body blockquote {
      color: var(--text-primary);
    }

    .export-document .markdown-body h1,
    .export-document .markdown-body h2,
    .export-document .markdown-body h3,
    .export-document .markdown-body h4,
    .export-document .markdown-body h5,
    .export-document .markdown-body h6 {
      color: ${theme === 'dark' ? '#c084fc' : '#7c3aed'};
    }

    .export-document .markdown-body a {
      color: var(--accent-color);
      text-decoration-thickness: 1.5px;
      text-underline-offset: 0.12em;
    }

    .export-document .markdown-body blockquote {
      border-left-color: ${theme === 'dark' ? 'rgba(192, 132, 252, 0.32)' : 'rgba(124, 58, 237, 0.28)'};
      color: ${theme === 'dark' ? '#ddd6fe' : '#5b21b6'};
      background: ${theme === 'dark' ? 'rgba(192, 132, 252, 0.06)' : 'rgba(124, 58, 237, 0.04)'};
      border-radius: 0 14px 14px 0;
      padding: 0.9rem 1rem;
    }

    .export-document .markdown-body code {
      background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'};
      border-radius: 0.45rem;
      padding: 0.15rem 0.35rem;
      font-family: ${resolvedCodeFontFamily};
      font-size: ${resolvedCodeFontSize}px;
    }

    .export-document .markdown-body pre {
      background: ${theme === 'dark' ? 'rgba(15, 23, 42, 0.82)' : 'rgba(248, 250, 252, 0.96)'};
      color: ${theme === 'dark' ? '#e5eef9' : '#1f2937'};
      border: 1px solid ${theme === 'dark' ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.2)'};
      border-radius: 1rem;
      padding: 0;
      overflow: hidden;
      box-shadow: ${theme === 'dark'
        ? 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
        : 'inset 0 1px 0 rgba(255, 255, 255, 0.55)'};
    }

    .export-document .markdown-body pre:not(.shiki) code {
      display: block;
      padding: 1rem 1.1rem;
      background: transparent;
      border-radius: 0;
      overflow-x: auto;
      white-space: pre;
    }

    .export-document .markdown-body pre.shiki {
      margin: 0;
      padding: 1rem 1.1rem;
      overflow-x: auto;
      border-radius: inherit;
      background: transparent !important;
    }

    .export-document .markdown-body pre.shiki code {
      display: block;
      padding: 0;
      color: inherit;
      background: transparent;
    }

    .export-document .markdown-body pre.shiki .line {
      display: block;
    }

    .export-document .markdown-body table th,
    .export-document .markdown-body table td {
      border-color: var(--border-color);
    }

    .export-document .markdown-body table tr {
      background-color: transparent;
    }

    .export-document .markdown-body table tr:nth-child(2n) {
      background-color: var(--bg-secondary);
    }

    .export-properties {
      margin-bottom: 32px;
      border: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#e5e7eb'};
      border-radius: 12px;
      overflow: hidden;
      background: ${theme === 'dark' ? 'rgba(20, 20, 20, 0.75)' : 'rgba(255, 255, 255, 0.75)'};
      box-shadow: ${theme === 'dark' ? 'none' : '0 8px 24px rgba(15, 23, 42, 0.05)'};
    }

    .export-properties-header {
      padding: 8px 16px;
      border-bottom: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : '#e5e7eb'};
      background: ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(249, 250, 251, 0.7)'};
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: ${theme === 'dark' ? '#9ca3af' : '#6b7280'};
    }

    .export-properties-table {
      display: table;
      width: 100%;
      border-collapse: collapse;
    }

    .export-properties-row {
      display: table-row;
    }

    .export-properties-row:hover {
      background: ${theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'};
    }

    .export-properties-key,
    .export-properties-value {
      display: table-cell;
      padding: 8px 12px;
      vertical-align: top;
      font-size: 14px;
    }

    .export-properties-key {
      width: 160px;
      font-weight: 500;
      color: ${theme === 'dark' ? '#9ca3af' : '#6b7280'};
    }

    .export-properties-value {
      color: var(--text-primary);
      word-break: break-word;
      white-space: pre-wrap;
    }

    .export-document .toc {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 1em;
      margin: 1em 0;
    }

    .export-document .toc h2 {
      margin-top: 0;
      font-size: 1.25em;
      border-bottom: none;
    }

    .export-document .toc ul {
      list-style: none;
    }

    .export-document .toc ul ul {
      padding-left: 1.5em;
    }

    .export-document .katex-display {
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.5em 0;
    }

    .export-document img,
    .export-document svg {
      max-width: 100%;
      height: auto;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 12mm;
      }

      .export-stage {
        background: transparent;
      }

      .export-document {
        padding: 0;
        max-width: none;
      }

      .export-document pre {
        page-break-inside: avoid;
      }

      .export-document h1, .export-document h2, .export-document h3 {
        page-break-after: avoid;
      }
    }

    @media (max-width: 768px) {
      .export-document {
        padding: 1rem;
      }
    }
  `;
}

export function buildExportDocument(contentHtml: string, toc: string): string {
  return `
    <div class="export-stage">
      <div class="export-document">
        ${toc}
        ${contentHtml}
      </div>
    </div>
  `;
}

export function generateTOC(content: string): string {
  const headings: { level: number; text: string; id: string }[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    headings.push({ level, text, id });
  }

  if (headings.length === 0) return '';

  let toc = '<div class="toc">\n<h2>Table of Contents</h2>\n<ul>\n';
  let lastLevel = 1;

  for (const heading of headings) {
    const { level, text, id } = heading;

    if (level > lastLevel) {
      toc += '<ul>\n'.repeat(level - lastLevel);
    } else if (level < lastLevel) {
      toc += '</li>\n</ul>\n'.repeat(lastLevel - level);
    } else {
      toc += '</li>\n';
    }

    toc += `<li><a href="#${id}">${text}</a>`;
    lastLevel = level;
  }

  toc += '</li>\n</ul>\n'.repeat(lastLevel);
  toc += '</div>\n';

  return toc;
}
