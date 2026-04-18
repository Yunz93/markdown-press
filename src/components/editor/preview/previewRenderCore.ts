import DOMPurify from 'dompurify';
import { parseFrontmatter } from '../../../utils/frontmatter';
import { renderMarkdown } from '../../../utils/markdown';
import { hydrateCachedPreviewImageSources } from '../../../utils/previewImageCache';
import type { ShikiHighlighter } from '../../../hooks/useShikiHighlighter';
import { hasEmbeddableMediaLinksInHtml, hasWikiEmbedsInHtml } from './previewMedia';

interface RenderMarkdownPreviewOptions {
  content: string;
  currentFilePath?: string | null;
  highlighter?: ShikiHighlighter | null;
  isMarkdownPreview: boolean;
  themeMode: 'light' | 'dark';
}

export function renderMarkdownPreview(options: RenderMarkdownPreviewOptions) {
  const { content, currentFilePath, highlighter, isMarkdownPreview, themeMode } = options;

  if (!isMarkdownPreview) {
    return { frontmatter: null, bodyHTML: '' };
  }

  if (!content) {
    return { frontmatter: null, bodyHTML: '' };
  }

  const { frontmatter, body } = parseFrontmatter(content);
  try {
    const bodyHTML = hydrateCachedPreviewImageSources(
      renderMarkdown(body, { highlighter, themeMode }),
      currentFilePath || undefined
    );
    return { frontmatter, bodyHTML };
  } catch (error) {
    console.error('Markdown rendering error:', error);
    return { frontmatter, bodyHTML: '<p>Error rendering markdown</p>' };
  }
}

export function sanitizeHtmlPreview(content: string, isHtmlPreview: boolean): string {
  if (!isHtmlPreview || !content) {
    return '';
  }

  return DOMPurify.sanitize(content, {
    ADD_TAGS: ['iframe', 'style'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'class', 'frameborder', 'href', 'id', 'rel', 'scrolling', 'src', 'style', 'target', 'title'],
  });
}

export function getBasePreviewHtml(
  isMarkdownPreview: boolean,
  markdownBodyHtml: string,
  sanitizedHtmlPreview: string
): string {
  return isMarkdownPreview ? markdownBodyHtml : sanitizedHtmlPreview;
}

export function shouldUseAsyncPreviewEnhancement(basePreviewHtml: string, isMarkdownPreview: boolean): boolean {
  const hasWikiEmbeds = isMarkdownPreview && hasWikiEmbedsInHtml(basePreviewHtml);

  return Boolean(basePreviewHtml) && (
    basePreviewHtml.includes('<img')
    || basePreviewHtml.includes('<video')
    || basePreviewHtml.includes('<source')
    || basePreviewHtml.includes('<iframe')
    || hasWikiEmbeds
    || hasEmbeddableMediaLinksInHtml(basePreviewHtml)
  );
}
