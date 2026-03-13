import DOMPurify from 'dompurify';
import { useEffect, useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { initKaTeX, initMermaid, applyKatexDarkTheme } from './markdown-extensions';

// Create markdown-it instance with configuration
const createMarkdownIt = () => {
  const md = new MarkdownIt({
    html: false, // Disable raw HTML for security
    linkify: true,
    typographer: true,
    breaks: true,
  }).use(taskLists);

  // Initialize extensions
  initKaTeX(md);
  initMermaid(md);

  const defaultImageRenderer = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet('decoding', 'async');

    if (defaultImageRenderer) {
      return defaultImageRenderer(tokens, idx, options, env, self);
    }

    return self.renderToken(tokens, idx, options);
  };

  return md;
};

// Get or create markdown-it instance
let mdInstance: MarkdownIt | null = null;

export function getMarkdownIt(): MarkdownIt {
  if (!mdInstance) {
    mdInstance = createMarkdownIt();
  }
  return mdInstance;
}

/**
 * React hook for markdown renderer with Shiki syntax highlighting
 */
export function useMarkdownRenderer(highlighter: any | null, themeMode: string) {
  const md = useMemo(() => getMarkdownIt(), []);

  useEffect(() => {
    if (!highlighter) return undefined;

    const theme = themeMode === 'dark' || themeMode === 'solarized-dark' ? 'github-dark' : 'github-light';
    const previousFence = md.renderer.rules.fence;

    // Layer Shiki highlighting on top of the existing fence rule (Mermaid-aware).
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const lang = token.info.trim().toLowerCase();
      const supportedLangs = highlighter.getLoadedLanguages?.() || [];

      // Keep Mermaid rendering behavior from the previous fence rule.
      if (lang === 'mermaid' || lang === 'mmd') {
        return previousFence
          ? previousFence(tokens, idx, options, env, self)
          : `<pre><code class="language-${lang}">${md.utils.escapeHtml(token.content.trim())}</code></pre>`;
      }

      if (lang && supportedLangs.includes(lang)) {
        try {
          return highlighter.codeToHtml(token.content.trim(), { lang, theme });
        } catch (error) {
          console.warn(`Shiki failed for ${lang}:`, error);
        }
      }

      if (previousFence) {
        return previousFence(tokens, idx, options, env, self);
      }
      return `<pre><code class="language-${lang}">${md.utils.escapeHtml(token.content.trim())}</code></pre>`;
    };

    return () => {
      md.renderer.rules.fence = previousFence;
    };
  }, [highlighter, themeMode, md]);

  // Apply KaTeX theme
  useEffect(() => {
    applyKatexDarkTheme();
  }, [themeMode]);

  return md;
}

/**
 * Render markdown to HTML with sanitization
 */
export function renderMarkdown(markdown: string): string {
  const md = getMarkdownIt();
  const renderedHtml = md.render(markdown);

  // Sanitize HTML to prevent XSS attacks
  return DOMPurify.sanitize(renderedHtml, {
    ADD_TAGS: ['iframe'], // Allow iframe for embeds if needed
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'], // iframe attributes
  });
}

/**
 * Configure custom CSS classes for markdown rendering
 */
export function configureMarkdownClasses(md: MarkdownIt, classes: Record<string, string>) {
  // Configure heading classes
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const level = token.tag.substring(1);
    token.attrPush(['class', `heading-${level}`]);
    return self.renderToken(tokens, idx, options);
  };

  // Configure link classes
  const defaultLinkOpen = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrPush(['class', 'markdown-link']);
    return defaultLinkOpen?.(tokens, idx, options, env, self) || self.renderToken(tokens, idx, options);
  };
}

export default getMarkdownIt;
