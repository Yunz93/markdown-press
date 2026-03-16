import DOMPurify from 'dompurify';
import { useEffect } from 'react';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { initKaTeX, initMermaid, applyKatexDarkTheme } from './markdown-extensions';
import { parseWikiLinkReference } from './wikiLinks';
import type { ThemeMode } from '../types';

interface MarkdownRenderOptions {
  highlighter?: any | null;
  themeMode?: ThemeMode;
}

// Create markdown-it instance with configuration
const createMarkdownIt = () => {
  const md = new MarkdownIt({
    html: false, // Disable raw HTML for security
    linkify: true,
    typographer: true,
    breaks: true,
  }).use(taskLists);

  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const start = state.pos;
    const source = state.src;

    if (source[start] !== '[' || source[start + 1] !== '[') {
      return false;
    }

    const end = source.indexOf(']]', start + 2);
    if (end === -1) return false;

    const rawContent = source.slice(start + 2, end).trim();
    if (!rawContent || rawContent.includes('\n')) return false;

    if (!silent) {
      const token = state.push('wikilink', '', 0);
      token.content = rawContent;
    }

    state.pos = end + 2;
    return true;
  });

  md.renderer.rules.wikilink = (tokens, idx) => {
    const rawContent = tokens[idx].content;
    const { target, displayText } = parseWikiLinkReference(rawContent);
    const escapedTarget = md.utils.escapeHtml(target);
    const escapedLabel = md.utils.escapeHtml(displayText || target);
    return `<a class="markdown-link markdown-wikilink" href="#" data-wikilink="${escapedTarget}">${escapedLabel}</a>`;
  };

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
let baseFenceRenderer: MarkdownIt['renderer']['rules']['fence'] | null = null;

export function getMarkdownIt(): MarkdownIt {
  if (!mdInstance) {
    mdInstance = createMarkdownIt();
    baseFenceRenderer = mdInstance.renderer.rules.fence || null;
  }
  return mdInstance;
}

function configureFenceRenderer(md: MarkdownIt, highlighter: any | null, themeMode: ThemeMode = 'light') {
  const baseFence = baseFenceRenderer || md.renderer.rules.fence;
  const theme = themeMode === 'dark' ? 'github-dark' : 'github-light';

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().toLowerCase();
    const supportedLangs = highlighter?.getLoadedLanguages?.() || [];

    if (lang === 'mermaid' || lang === 'mmd') {
      return baseFence
        ? baseFence(tokens, idx, options, env, self)
        : `<pre><code class="language-${lang}">${md.utils.escapeHtml(token.content.trim())}</code></pre>`;
    }

    if (highlighter && lang && supportedLangs.includes(lang)) {
      try {
        return highlighter.codeToHtml(token.content.trim(), { lang, theme });
      } catch (error) {
        console.warn(`Shiki failed for ${lang}:`, error);
      }
    }

    if (baseFence) {
      return baseFence(tokens, idx, options, env, self);
    }

    return `<pre><code class="language-${lang}">${md.utils.escapeHtml(token.content.trim())}</code></pre>`;
  };
}

/**
 * React hook for markdown renderer with Shiki syntax highlighting
 */
export function useMarkdownRenderer(highlighter: any | null, themeMode: ThemeMode) {
  // Apply KaTeX theme
  useEffect(() => {
    applyKatexDarkTheme();
  }, [themeMode]);
}

/**
 * Render markdown to HTML with sanitization
 */
export function renderMarkdown(markdown: string, options: MarkdownRenderOptions = {}): string {
  const md = getMarkdownIt();
  configureFenceRenderer(md, options.highlighter ?? null, options.themeMode ?? 'light');
  const renderedHtml = md.render(markdown);

  // Sanitize HTML to prevent XSS attacks
  return DOMPurify.sanitize(renderedHtml, {
    ADD_TAGS: ['iframe'], // Allow iframe for embeds if needed
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'data-wikilink'], // iframe attributes
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
