import { renderMarkdown } from './markdown';

export interface ExportOptions {
  title?: string;
  theme?: 'light' | 'dark';
  includeTOC?: boolean;
}

/**
 * Export markdown content to HTML
 */
export async function exportToHtml(
  content: string,
  options: ExportOptions = {}
): Promise<string> {
  const { title = 'Exported Document', theme = 'light', includeTOC = false } = options;

  // Convert markdown to HTML
  const htmlContent = renderMarkdown(content);

  // Generate table of contents if requested
  const toc = includeTOC ? generateTOC(content) : '';

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <style>
    :root {
      --bg-primary: ${theme === 'dark' ? '#0d1117' : '#ffffff'};
      --bg-secondary: ${theme === 'dark' ? '#161b22' : '#f6f8fa'};
      --text-primary: ${theme === 'dark' ? '#c9d1d9' : '#24292f'};
      --text-secondary: ${theme === 'dark' ? '#8b949e' : '#57606a'};
      --border-color: ${theme === 'dark' ? '#30363d' : '#d0d7de'};
      --accent-color: #58a6ff;
      --code-bg: ${theme === 'dark' ? '#161b22' : '#f6f8fa'};
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      padding: 2rem;
      max-width: 980px;
      margin: 0 auto;
    }

    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
      line-height: 1.25;
      color: var(--text-primary);
    }

    h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border-color); }
    h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border-color); }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    h5 { font-size: 0.875em; }
    h6 { font-size: 0.85em; color: var(--text-secondary); }

    p { margin: 1em 0; }

    a {
      color: var(--accent-color);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 0.85em;
      background-color: var(--code-bg);
      padding: 0.2em 0.4em;
      border-radius: 6px;
    }

    pre {
      background-color: var(--code-bg);
      border-radius: 6px;
      padding: 1em;
      overflow-x: auto;
      margin: 1em 0;
    }

    pre code {
      background-color: transparent;
      padding: 0;
    }

    blockquote {
      margin: 1em 0;
      padding: 0.5em 1em;
      border-left: 4px solid var(--accent-color);
      color: var(--text-secondary);
    }

    ul, ol {
      margin: 1em 0;
      padding-left: 2em;
    }

    li {
      margin: 0.5em 0;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }

    th, td {
      border: 1px solid var(--border-color);
      padding: 0.75em;
      text-align: left;
    }

    th {
      background-color: var(--bg-secondary);
      font-weight: 600;
    }

    tr:nth-child(even) {
      background-color: var(--bg-secondary);
    }

    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1em auto;
    }

    hr {
      border: none;
      border-top: 1px solid var(--border-color);
      margin: 2em 0;
    }

    .toc {
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 1em;
      margin: 1em 0;
    }

    .toc h2 {
      margin-top: 0;
      font-size: 1.25em;
      border-bottom: none;
    }

    .toc ul {
      list-style: none;
    }

    .toc ul ul {
      padding-left: 1.5em;
    }

    .katex-display {
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.5em 0;
    }

    @media print {
      body {
        padding: 0;
        max-width: none;
      }

      pre {
        page-break-inside: avoid;
      }

      h1, h2, h3 {
        page-break-after: avoid;
      }
    }

    @media (max-width: 768px) {
      body {
        padding: 1rem;
      }
    }
  </style>
</head>
<body>
  ${toc}
  <article class="markdown-body">
    ${htmlContent}
  </article>
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
export function downloadHtml(htmlContent: string, filename: string): void {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export to PDF (using browser print dialog)
 */
export function exportToPdf(htmlContent: string, filename: string): void {
  // Create a new window with the HTML content
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export PDF');
    return;
  }

  printWindow.document.write(htmlContent);
  printWindow.document.close();

  // Wait for content to load, then print
  printWindow.onload = () => {
    printWindow.print();
  };
}

/**
 * Export to plain text
 */
export function exportToPlainText(content: string): string {
  // Remove markdown formatting
  let text = content;

  // Remove frontmatter
  if (text.startsWith('---')) {
    const endIdx = text.indexOf('---', 3);
    if (endIdx !== -1) {
      text = text.substring(endIdx + 3);
    }
  }

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
export function downloadPlainText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.txt') ? filename : `${filename}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
