import DOMPurify from 'dompurify';
import { useEffect, useMemo, useCallback } from 'react';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { initKaTeX, initMermaid, renderMermaidDiagrams, applyKatexDarkTheme } from './markdown-extensions';

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
    if (!highlighter) return;

    const theme = themeMode === 'dark' || themeMode === 'solarized-dark' ? 'github-dark' : 'github-light';

    // Configure fence rule for syntax highlighting
    md.renderer.rules.fence = (tokens, idx) => {
      const token = tokens[idx];
      const lang = token.info.trim();
      const supportedLangs = highlighter.getLoadedLanguages?.() || [];

      if (lang && supportedLangs.includes(lang)) {
        try {
          return highlighter.codeToHtml(token.content.trim(), { lang, theme });
        } catch (error) {
          console.warn(`Shiki failed for ${lang}:`, error);
        }
      }

      // Fallback to default code block
      return `<pre><code class="language-${lang}">${md.utils.escapeHtml(token.content.trim())}</code></pre>`;
    };
  }, [highlighter, themeMode, md]);

  // Apply KaTeX theme
  useEffect(() => {
    applyKatexDarkTheme();
  }, [themeMode]);

  // Render Mermaid diagrams after content changes
  useEffect(() => {
    const timer = setTimeout(() => {
      renderMermaidDiagrams();
    }, 100);
    return () => clearTimeout(timer);
  }, [themeMode]);

  return md;
}

/**
 * Render markdown to HTML with sanitization
 */
export function renderMarkdown(markdown: string, highlighter?: any, themeMode: string = 'light'): string {
  const md = getMarkdownIt();

  let renderedHtml: string;

  if (highlighter) {
    const theme = themeMode === 'dark' || themeMode === 'solarized-dark' ? 'github-dark' : 'github-light';
    const supportedLangs = highlighter.getLoadedLanguages?.() || [];

    renderedHtml = md.render(markdown, {
      highlight: (str: string, lang: string) => {
        if (lang && supportedLangs.includes(lang)) {
          try {
            return highlighter.codeToHtml(str.trim(), { lang, theme });
          } catch (error) {
            console.warn(`Shiki failed for ${lang}:`, error);
          }
        }
        return '';
      }
    });
  } else {
    renderedHtml = md.render(markdown);
  }

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
