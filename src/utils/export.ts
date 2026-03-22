import { renderMarkdown } from './markdown';
import { parseFrontmatter } from './frontmatter';
import { renderMermaidDiagrams } from './markdown-extensions';
import { createAttachmentResolverContext, resolveAttachmentTarget } from './attachmentResolver';
import { parseWikiLinkReference } from './wikiLinks';
import katexCss from 'katex/dist/katex.min.css?inline';
import githubMarkdownCss from 'github-markdown-css/github-markdown.css?inline';
import { isTauriEnvironment } from '../types/filesystem';

export interface ExportOptions {
  title?: string;
  theme?: 'light' | 'dark';
  includeTOC?: boolean;
  fontFamily?: string;
  fontSize?: number;
  includeProperties?: boolean;
  highlighter?: any | null;
}

interface SaveExportOptions {
  content: string | Uint8Array;
  filename: string;
  defaultExtension: string;
  mimeType: string;
  description: string;
}

const PREVIEW_PANEL_WIDTH_PX = 768;
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderProperties(frontmatter: Record<string, unknown> | null): string {
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

function buildExportStyles(theme: 'light' | 'dark', fontFamily?: string, fontSize?: number): string {
  const resolvedFontFamily = fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';
  const resolvedFontSize = fontSize ?? 16;

  return `
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
      font-family: "SFMono-Regular", "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
      font-size: 0.92em;
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

    .export-document .markdown-body pre code {
      display: block;
      padding: 1rem 1.1rem;
      background: transparent;
      border-radius: 0;
      overflow-x: auto;
      white-space: pre;
    }

    .export-document .markdown-body pre .shiki {
      margin: 0;
      padding: 1rem 1.1rem;
      overflow-x: auto;
      border-radius: inherit;
      background: transparent !important;
    }

    .export-document .markdown-body pre .shiki code {
      padding: 0;
      background: transparent;
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

function buildExportDocument(contentHtml: string, toc: string): string {
  return `
    <div class="export-stage">
      <div class="export-document">
        ${toc}
        ${contentHtml}
      </div>
    </div>
  `;
}

/**
 * Export markdown content to HTML
 */
export function exportToHtml(
  content: string,
  options: ExportOptions = {}
): string {
  const {
    title = 'Exported Document',
    theme = 'light',
    includeTOC = false,
    fontFamily,
    fontSize,
    includeProperties = true,
    highlighter,
  } = options;

  const { frontmatter, body } = parseFrontmatter(content);
  const htmlContent = renderMarkdown(body, { highlighter, themeMode: theme });

  // Generate table of contents if requested
  const toc = includeTOC ? generateTOC(body) : '';
  const styles = buildExportStyles(theme, fontFamily, fontSize);
  const propertiesHtml = includeProperties ? renderProperties(frontmatter) : '';
  const documentMarkup = buildExportDocument(`${propertiesHtml}<article class="markdown-body">${htmlContent}</article>`, toc);

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${styles}
  </style>
</head>
<body>
  ${documentMarkup}
</body>
</html>`;

  return html;
}

/**
 * Generate table of contents from markdown
 */
function generateTOC(content: string): string {
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

/**
 * Trigger download of HTML file
 */
function ensureFileExtension(filename: string, extension: string): string {
  const baseFilename = filename.replace(/\.md$/i, '');
  const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
  return baseFilename.toLowerCase().endsWith(normalizedExtension.toLowerCase())
    ? baseFilename
    : `${baseFilename}${normalizedExtension}`;
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted');
}

async function saveExportFile({
  content,
  filename,
  defaultExtension,
  mimeType,
  description,
}: SaveExportOptions): Promise<boolean> {
  const suggestedName = ensureFileExtension(filename, defaultExtension);

  if (isTauriEnvironment()) {
    const [{ save }, { writeFile, writeTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs')
    ]);

    const targetPath = await save({
      defaultPath: suggestedName,
      filters: [{ name: description, extensions: [defaultExtension.replace(/^\./, '')] }]
    });

    if (!targetPath) {
      return false;
    }

    if (typeof content === 'string') {
      await writeTextFile(targetPath, content);
      return true;
    }

    await writeFile(targetPath, content);
    return true;
  }

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as Window & {
        showSaveFilePicker: (options?: {
          suggestedName?: string;
          types?: Array<{
            description?: string;
            accept: Record<string, string[]>;
          }>;
        }) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName,
        types: [{
          description,
          accept: { [mimeType]: [defaultExtension.startsWith('.') ? defaultExtension : `.${defaultExtension}`] }
        }]
      });

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (error) {
      if (isAbortLikeError(error)) {
        return false;
      }

      throw error;
    }
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  const pendingImages = images.filter((image) => !image.complete);

  if (pendingImages.length === 0) {
    return;
  }

  await Promise.all(
    pendingImages.map((image) => new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    }))
  );
}

async function waitForNextPaint(frames = 2): Promise<void> {
  for (let index = 0; index < frames; index += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

function isImageAttachmentName(fileName: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(fileName);
}

async function enhanceExportAttachmentEmbeds(container: HTMLElement, sourceFilePath?: string): Promise<void> {
  if (!sourceFilePath) return;

  const resolverContext = createAttachmentResolverContext([], null, sourceFilePath);
  const embeds = Array.from(container.querySelectorAll<HTMLElement>('article.markdown-body [data-wiki-embed="true"], article.markdown-body a.markdown-embed'));

  for (const embed of embeds) {
    const target = embed.dataset.wikiTarget?.trim() || embed.dataset.wikilink?.trim();
    if (!target) continue;

    const resolvedTarget = await resolveAttachmentTarget(resolverContext, target);
    if (!resolvedTarget || !isImageAttachmentName(resolvedTarget.name)) {
      continue;
    }

    const parsedTarget = parseWikiLinkReference(target, { embed: true });
    const width = embed.dataset.wikiWidth || (parsedTarget.embedSize?.width ? String(parsedTarget.embedSize.width) : '');
    const height = embed.dataset.wikiHeight || (parsedTarget.embedSize?.height ? String(parsedTarget.embedSize.height) : '');
    const image = document.createElement('img');
    image.className = 'preview-attachment-image';
    image.alt = embed.dataset.wikiLabel?.trim() || resolvedTarget.name;
    image.setAttribute('data-original-src', resolvedTarget.path);
    image.setAttribute('src', resolvedTarget.path);

    if (width) {
      image.style.width = `${width}px`;
    }
    if (height) {
      image.style.height = `${height}px`;
      image.style.objectFit = 'contain';
    }

    embed.replaceWith(image);
  }
}

async function prepareHtmlForDownload(htmlContent: string, sourceFilePath?: string): Promise<string> {
  const parsed = new DOMParser().parseFromString(htmlContent, 'text/html');
  const styleContent = Array.from(parsed.head.querySelectorAll('style'))
    .map((style) => style.textContent || '')
    .join('\n');
  const theme = parsed.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const backgroundColor = theme === 'dark' ? '#0d1117' : '#ffffff';

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${PREVIEW_PANEL_WIDTH_PX + 64}px`;
  host.style.background = backgroundColor;
  host.style.pointerEvents = 'none';
  host.style.visibility = 'hidden';
  host.style.opacity = '0';
  host.style.overflow = 'visible';
  host.innerHTML = `<style>${styleContent}</style>${parsed.body.innerHTML}`;
  document.body.appendChild(host);

  try {
    const exportRoot = host.querySelector('.export-document') as HTMLElement | null;
    const renderTarget = exportRoot || host;

    renderTarget.setAttribute('data-theme', theme);
    await enhanceExportAttachmentEmbeds(renderTarget, sourceFilePath);
    await prepareExportImages(renderTarget, sourceFilePath);
    await renderMermaidDiagrams(renderTarget);
    await waitForImages(renderTarget);
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    await waitForNextPaint(2);

    const processedBody = host.innerHTML.replace(/^<style>[\s\S]*?<\/style>/, '');
    return `<!DOCTYPE html>
<html lang="${parsed.documentElement.lang || 'en'}" data-theme="${theme}">
<head>
${parsed.head.innerHTML}
</head>
<body>
${processedBody}
</body>
</html>`;
  } finally {
    host.remove();
  }
}

export async function downloadHtml(htmlContent: string, filename: string, sourceFilePath?: string): Promise<boolean> {
  return saveExportFile({
    content: await prepareHtmlForDownload(htmlContent, sourceFilePath),
    filename,
    defaultExtension: '.html',
    mimeType: 'text/html;charset=utf-8',
    description: 'HTML Document',
  });
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value);
}

function isAbsoluteFilePath(value: string): boolean {
  return /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(value);
}

function decodeFileUrlPath(fileUrl: string): string {
  try {
    const url = new URL(fileUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return /^\/[a-zA-Z]:\//.test(decodedPath) ? decodedPath.slice(1) : decodedPath;
  } catch {
    return fileUrl.replace(/^file:\/\//i, '');
  }
}

function isRemoteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeRemoteImageUrl(value: string): string {
  if (value.startsWith('//') && typeof window !== 'undefined') {
    return `${window.location.protocol}${value}`;
  }
  return value;
}

function decodeLocalImageSource(value: string): string {
  if (!value || hasUrlScheme(value) || value.startsWith('//')) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

async function inlineFetchedImage(src: string): Promise<string> {
  const normalizedSrc = normalizeRemoteImageUrl(src);
  const response = await fetch(normalizedSrc, {
    mode: 'cors',
    credentials: 'omit',
    cache: 'force-cache',
    referrerPolicy: 'no-referrer',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return blobToDataUrl(await response.blob());
}

async function resolveImageSource(src: string, sourceFilePath?: string): Promise<string> {
  const trimmedSrc = decodeLocalImageSource(src.trim());
  if (!trimmedSrc || trimmedSrc.startsWith('data:') || trimmedSrc.startsWith('blob:')) {
    return trimmedSrc;
  }

  if (isTauriEnvironment()) {
    if (trimmedSrc.startsWith('asset:') || trimmedSrc.startsWith('tauri:')) {
      return trimmedSrc;
    }

    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const { dirname, join, normalize } = await import('@tauri-apps/api/path');

    let absolutePath = '';
    if (trimmedSrc.startsWith('file://')) {
      absolutePath = decodeFileUrlPath(trimmedSrc);
    } else if (isAbsoluteFilePath(trimmedSrc)) {
      absolutePath = trimmedSrc;
    } else if (sourceFilePath && !hasUrlScheme(trimmedSrc)) {
      absolutePath = await join(await dirname(sourceFilePath), trimmedSrc);
    } else {
      return trimmedSrc;
    }

    return convertFileSrc(await normalize(absolutePath));
  }

  if (!hasUrlScheme(trimmedSrc) && sourceFilePath && typeof window !== 'undefined') {
    try {
      return new URL(trimmedSrc, window.location.href).toString();
    } catch {
      return trimmedSrc;
    }
  }

  return trimmedSrc;
}

async function prepareExportImages(container: HTMLElement, sourceFilePath?: string): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    const rawSrc = image.getAttribute('src');
    if (!rawSrc) return;

    const resolvedSrc = await resolveImageSource(rawSrc, sourceFilePath);
    if (!resolvedSrc) return;

    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';

    let exportSrc = resolvedSrc;
    try {
      exportSrc = await inlineFetchedImage(resolvedSrc);
    } catch (error) {
      if (isRemoteHttpUrl(resolvedSrc)) {
        console.warn('Failed to inline remote image for HTML export:', resolvedSrc, error);
      } else {
        console.warn('Failed to inline local image for HTML export:', resolvedSrc, error);
      }
    }

    if (exportSrc !== rawSrc) {
      image.setAttribute('src', exportSrc);
      image.src = exportSrc;
    }
  }));
}

/**
 * Export to PDF (generates a real PDF file and lets the user choose where to save it)
 */
export async function exportToPdf(htmlContent: string, filename: string, sourceFilePath?: string): Promise<boolean> {
  const { default: html2pdf } = await import('html2pdf.js');
  const parsed = new DOMParser().parseFromString(htmlContent, 'text/html');
  const styleContent = Array.from(parsed.head.querySelectorAll('style'))
    .map((style) => style.textContent || '')
    .join('\n');
  const theme = parsed.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const backgroundColor = theme === 'dark' ? '#0d1117' : '#ffffff';

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${PREVIEW_PANEL_WIDTH_PX + 64}px`;
  host.style.background = backgroundColor;
  host.style.pointerEvents = 'none';
  host.style.visibility = 'hidden';
  host.style.opacity = '0';
  host.style.overflow = 'visible';
  host.style.contain = 'layout style';
  host.innerHTML = `<style>${styleContent}</style>${parsed.body.innerHTML}`;
  document.body.appendChild(host);

  const exportRoot = host.querySelector('.export-document') as HTMLElement | null;
  const renderTarget = exportRoot || host;

  try {
    renderTarget.setAttribute('data-theme', theme);

    await prepareExportImages(renderTarget, sourceFilePath);
    await renderMermaidDiagrams(renderTarget);
    await waitForImages(renderTarget);
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    await waitForNextPaint(3);

    const worker = html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        enableLinks: true,
        html2canvas: {
          scale: 2.5,
          useCORS: true,
          backgroundColor,
          windowWidth: renderTarget.scrollWidth,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        },
        pagebreak: {
          mode: ['css', 'legacy'],
          avoid: ['pre', 'blockquote', 'table', 'img', '.export-properties']
        } as unknown
      })
      .from(renderTarget)
      .toPdf();

    const pdfArrayBuffer = await worker.outputPdf('arraybuffer');
    return saveExportFile({
      content: new Uint8Array(pdfArrayBuffer),
      filename,
      defaultExtension: '.pdf',
      mimeType: 'application/pdf',
      description: 'PDF Document',
    });
  } finally {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}

/**
 * Export to plain text
 */
export function exportToPlainText(content: string): string {
  // Remove markdown formatting
  let text = parseFrontmatter(content).body;

  // Remove code blocks (keep content)
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    return match.replace(/```[a-z]*\n?/g, '').replace(/```/g, '');
  });

  // Remove inline code
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Convert links to text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove bold/italic
  text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');

  // Remove heading markers
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove blockquotes
  text = text.replace(/^>\s+/gm, '');

  // Remove list markers
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');
  text = text.replace(/^[\s]*\d+\.\s+/gm, '');

  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Trigger download of plain text file
 */
export async function downloadPlainText(text: string, filename: string): Promise<boolean> {
  return saveExportFile({
    content: text,
    filename,
    defaultExtension: '.txt',
    mimeType: 'text/plain;charset=utf-8',
    description: 'Plain Text Document',
  });
}
