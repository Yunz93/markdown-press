import { renderMarkdown } from '../markdown';
import { parseFrontmatter } from '../frontmatter';
import { getCompositeFontFamily } from '../fontSettings';
import type { ExportOptions } from './types';
import {
  buildExportStyles,
  buildExportDocument,
  buildExportFontFaceCss,
  renderProperties,
  generateTOC,
} from './styles';
import { saveExportFile } from './core';
import { prepareHtmlForDownload } from './attachments';

export async function exportToHtml(
  content: string,
  options: ExportOptions = {}
): Promise<string> {
  const {
    title = 'Exported Document',
    theme = 'light',
    includeTOC = false,
    fontFamily,
    fontSettings,
    fontSize,
    includeProperties = true,
    highlighter,
  } = options;

  const { frontmatter, body } = parseFrontmatter(content);
  const htmlContent = renderMarkdown(body, { highlighter, themeMode: theme });

  // Generate table of contents if requested
  const toc = includeTOC ? generateTOC(body) : '';
  const resolvedFontFamily = fontFamily || (fontSettings ? getCompositeFontFamily(fontSettings) : undefined);
  const fontFaceCss = await buildExportFontFaceCss(fontSettings);
  const styles = buildExportStyles(theme, resolvedFontFamily, fontSize, fontFaceCss);
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

export async function downloadHtml(htmlContent: string, filename: string, sourceFilePath?: string): Promise<boolean> {
  return saveExportFile({
    content: await prepareHtmlForDownload(htmlContent, sourceFilePath),
    filename,
    defaultExtension: '.html',
    mimeType: 'text/html;charset=utf-8',
    description: 'HTML Document',
  });
}
