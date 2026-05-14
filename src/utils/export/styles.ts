import katexCss from 'katex/dist/katex.min.css?inline';
import githubMarkdownCss from 'github-markdown-css/github-markdown.css?inline';
import { escapeHtml } from './core';
import { PREVIEW_PANEL_WIDTH_PX } from './types';
import {
  buildDynamicFontFaceCss,
  type FontSettings,
  getBundledPresetDataUrlOverrides,
} from '../fontSettings';
import { getMarkdownStyleCssVariables, getMarkdownStyleTokens, normalizeMarkdownStylePreset } from '../markdownStyle';
import type { MarkdownStylePreset } from '../../types';

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
  markdownStylePreset: MarkdownStylePreset = 'nord',
): string {
  const resolvedFontFamily = fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';
  const resolvedFontSize = fontSize ?? 16;
  const resolvedCodeFontFamily = codeFontFamily || '"SFMono-Regular", "JetBrains Mono", "Fira Code", "Cascadia Code", monospace';
  const resolvedCodeFontSize = codeFontSize ?? Math.max(12, resolvedFontSize - 1);
  const normalizedStylePreset = normalizeMarkdownStylePreset(markdownStylePreset);
  const tokens = getMarkdownStyleTokens(normalizedStylePreset, theme);
  const markdownStyleCssVariables = Object.entries(getMarkdownStyleCssVariables(normalizedStylePreset, theme))
    .map(([name, value]) => `      ${name}: ${value};`)
    .join('\n');

  const exportDelStrikeBlock = `    .export-document .markdown-body del,
    .export-document .markdown-body s {
      color: var(--mp-doc-del);
      text-decoration: line-through;
    }
`;

  return `
    ${fontFaceCss}
    ${githubMarkdownCss}
    ${katexCss}

    :root {
      --bg-primary: ${theme === 'dark' ? '#0d1117' : '#ffffff'};
      --bg-secondary: ${theme === 'dark' ? '#161b22' : '#f6f8fa'};
      --text-primary: ${tokens.text};
      --text-secondary: ${tokens.muted};
      --border-color: ${tokens.border};
      --accent-color: ${tokens.accent};
      --code-bg: ${tokens.codeBg};
${markdownStyleCssVariables}
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
    html[data-theme="light"] .export-document .markdown-body {
      color: var(--mp-doc-text) !important;
      --color-fg-default: var(--mp-doc-text) !important;
      --color-fg-muted: var(--mp-doc-muted) !important;
      --color-canvas-default: transparent !important;
    }

    html.dark .export-document .markdown-body,
    html[data-theme="dark"] .export-document .markdown-body {
      color: var(--mp-doc-text);
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

    .export-document .markdown-body .katex,
    .export-document .markdown-body .katex * {
      word-break: normal !important;
      overflow-wrap: normal !important;
    }

    .export-document .markdown-body .katex {
      line-height: 1.2 !important;
      text-indent: 0;
    }

    .export-document .markdown-body .katex-display > .katex {
      white-space: nowrap;
    }

    html[data-katex-render-mode="mathml"] .export-document .katex .katex-html {
      display: none !important;
    }

    html[data-katex-render-mode="mathml"] .export-document .katex .katex-mathml {
      position: static !important;
      clip: auto !important;
      clip-path: none !important;
      width: auto !important;
      height: auto !important;
      padding: 0 !important;
      margin: 0 !important;
      overflow: visible !important;
      border: 0 !important;
      white-space: normal !important;
    }

    html[data-katex-render-mode="mathml"] .export-document .katex math {
      color: inherit;
    }

    html[data-katex-render-mode="mathml"] .export-document .katex-display > .katex .katex-mathml {
      display: block;
      text-align: center;
    }

    .export-document .markdown-body h1,
    .export-document .markdown-body h2,
    .export-document .markdown-body h3,
    .export-document .markdown-body h4,
    .export-document .markdown-body h5,
    .export-document .markdown-body h6 {
      color: var(--mp-doc-accent);
      background: var(--mp-doc-heading-bg);
      border-color: var(--mp-doc-heading-border);
      font-weight: var(--mp-doc-heading-weight);
    }

    .export-document .markdown-body h1 { color: var(--mp-doc-heading-1); }
    .export-document .markdown-body h2 {
      color: var(--mp-doc-heading-2);
      border-bottom: none;
      padding-bottom: 0;
    }
    .export-document .markdown-body h3 { color: var(--mp-doc-heading-3); }
    .export-document .markdown-body h4 { color: var(--mp-doc-heading-4); }
    .export-document .markdown-body h5 { color: var(--mp-doc-heading-5); }
    .export-document .markdown-body h6 { color: var(--mp-doc-heading-6); }

    .export-document .markdown-body ul,
    .export-document .markdown-body ol {
      margin: 0.5rem 0;
      padding-left: 2rem;
    }

    .export-document .markdown-body li > ul,
    .export-document .markdown-body li > ol {
      margin-top: 0.25rem;
      margin-bottom: 0.25rem;
      margin-left: 0.35rem;
      padding-left: 1.35rem;
      border-left: 1px solid var(--mp-doc-border);
    }

    .export-document .markdown-body ul {
      list-style: disc;
    }

    .export-document .markdown-body ul ul,
    .export-document .markdown-body ul ul ul {
      list-style: disc;
    }

    .export-document .markdown-body ol {
      list-style: decimal;
    }

    .export-document .markdown-body ol ol,
    .export-document .markdown-body ol ol ol {
      list-style: decimal;
    }

    /* Match preview.css: github-markdown uses ~16px margin-top on li>p, which pushes
       the first line down; html2canvas paints list markers at the li top without that
       offset, so bullets look vertically misaligned in PNG/PDF export. */
    .export-document .markdown-body li > p {
      margin-top: 0.15em;
      margin-bottom: 0.15em;
    }

    .export-document .markdown-body .task-list-item {
      position: relative;
      list-style: none;
      min-width: 0;
      padding-left: 0.34rem;
    }

    .export-document .markdown-body .task-list-item::marker {
      content: '';
    }

    .export-document .markdown-body .task-list-item + .task-list-item {
      margin-top: 0.45rem;
    }

    .export-document .markdown-body .task-list-item > p {
      margin: 0;
    }

    .export-document .markdown-body .task-list-item-checkbox {
      appearance: none;
      -webkit-appearance: none;
      position: absolute;
      top: calc((1.95em - 1em) / 2);
      left: -1.18rem;
      width: 1em;
      height: 1em;
      margin: 0;
      border: 1.5px solid var(--mp-doc-task-border, #94a3b8);
      border-radius: 0.28rem;
      background: #ffffff;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }

    .export-document .markdown-body .task-list-item-checkbox:checked {
      border-color: var(--mp-doc-task-checked, var(--mp-doc-accent));
      background-color: var(--mp-doc-task-checked, var(--mp-doc-accent));
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='white' d='M6.4 11.2 3.6 8.4l-1.1 1.1 3.9 3.9 7.1-7.1-1.1-1.1z'/%3E%3C/svg%3E");
      background-position: center;
      background-repeat: no-repeat;
      background-size: 0.82em 0.82em;
    }

    html.dark .export-document .markdown-body .task-list-item-checkbox,
    html[data-theme="dark"] .export-document .markdown-body .task-list-item-checkbox {
      border-color: var(--mp-doc-task-border, rgba(148, 163, 184, 0.68));
      background: rgba(15, 23, 42, 0.88);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    html.dark .export-document .markdown-body .task-list-item-checkbox:checked,
    html[data-theme="dark"] .export-document .markdown-body .task-list-item-checkbox:checked {
      border-color: var(--mp-doc-task-checked, var(--mp-doc-accent));
      background-color: var(--mp-doc-task-checked, var(--mp-doc-accent));
    }

    .export-document .markdown-body .footnotes {
      border-top: none;
    }

    .export-document .markdown-body a {
      color: var(--mp-doc-link);
      text-decoration-thickness: 1.5px;
      text-underline-offset: 0.12em;
    }

    .export-document .markdown-body a:hover {
      color: var(--mp-doc-link-hover);
    }

    .export-document .markdown-body .internal-link,
    .export-document .markdown-body .wiki-link {
      color: var(--mp-doc-link);
    }

    .export-document .markdown-body .internal-link.is-unresolved,
    .export-document .markdown-body .wiki-link.is-unresolved {
      color: var(--mp-doc-link-unresolved);
    }

    .export-document .markdown-body .external-link {
      color: var(--mp-doc-link-external);
    }

    .export-document .markdown-body strong {
      color: var(--mp-doc-strong);
    }

    .export-document .markdown-body em {
      color: var(--mp-doc-em);
    }

    .export-document .markdown-body strong em,
    .export-document .markdown-body em strong {
      color: var(--mp-doc-strong-em);
    }

${exportDelStrikeBlock}

    .export-document .markdown-body ins,
    .export-document .markdown-body u {
      text-decoration: none;
      background-image: linear-gradient(currentColor, currentColor);
      background-repeat: no-repeat;
      background-position: 0 88%;
      background-size: 100% 0.06em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }

    .export-document .markdown-body mark {
      color: var(--mp-doc-mark-text);
      background: var(--mp-doc-mark-bg);
    }

    .export-document .markdown-body a.tag,
    .export-document .markdown-body .tag {
      color: var(--mp-doc-tag-text);
      background: var(--mp-doc-tag-bg);
      border: 1px solid var(--mp-doc-tag-border);
      border-radius: 0.45rem;
      padding: 0.08rem 0.36rem;
      text-decoration: none;
    }

    .export-document .markdown-body blockquote {
      border-left-color: var(--mp-doc-accent);
      color: var(--mp-doc-quote-text);
      background: var(--mp-doc-quote-bg);
      border-radius: 0 14px 14px 0;
      padding: 0.9rem 1rem;
    }

    .export-document .markdown-body code {
      color: var(--mp-doc-code-text);
      background: var(--mp-doc-code-bg);
      border-radius: 0.45rem;
      padding: 0.15rem 0.35rem;
      font-family: ${resolvedCodeFontFamily};
      font-size: ${resolvedCodeFontSize}px;
    }

    .export-document .markdown-body pre {
      background: var(--mp-doc-code-bg);
      color: var(--mp-doc-code-text);
      border: 1px solid var(--mp-doc-code-border);
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

    .export-document .markdown-body pre,
    .export-document .markdown-body pre:not(.shiki) code,
    .export-document .markdown-body pre.shiki,
    .export-document .markdown-body pre.shiki code,
    .export-document .markdown-body pre.shiki .line {
      line-height: 1.15;
    }

    .export-document .markdown-body table th,
    .export-document .markdown-body table td {
      border-color: var(--border-color);
    }

    .export-document .markdown-body table tr {
      background-color: transparent;
    }

    .export-document .markdown-body table tr:nth-child(2n) {
      background-color: var(--mp-doc-table-row-alt-bg);
    }

    .export-document .markdown-body table tr:hover {
      background-color: var(--mp-doc-table-hover-bg);
    }

    .export-document .markdown-body table th {
      background-color: var(--mp-doc-table-header-bg);
      color: var(--mp-doc-text);
    }

    .export-document .markdown-body ul li::marker,
    .export-document .markdown-body ol li::marker {
      color: var(--mp-doc-list-marker);
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

export function buildExportDocument(
  contentHtml: string,
  toc: string,
  markdownStylePreset: MarkdownStylePreset = 'nord',
): string {
  return `
    <div class="export-stage">
      <div class="export-document" data-markdown-style="${normalizeMarkdownStylePreset(markdownStylePreset)}">
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
