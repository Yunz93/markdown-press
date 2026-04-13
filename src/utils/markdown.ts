import DOMPurify from 'dompurify';
import { useEffect } from 'react';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import taskLists from 'markdown-it-task-lists';
import { initKaTeX, initMermaid, applyKatexDarkTheme } from './markdown-extensions';
import { normalizeShikiLanguage } from './shikiLanguages';
import { getMarkdownPressShikiTheme } from './shikiTheme';
import { parseWikiLinkReference } from './wikiLinks';
import type { ThemeMode } from '../types';
import { LRUCache, hashContent } from './performance';
import type { ShikiHighlighter } from '../hooks/useShikiHighlighter';

interface MarkdownRenderOptions {
  highlighter?: ShikiHighlighter | null;
  themeMode?: ThemeMode;
}

interface MarkdownRenderEnv {
  shikiBlocks?: string[];
}

// Create markdown-it instance with configuration
const createMarkdownIt = () => {
  const md = new MarkdownIt({
    html: true, // Allow raw HTML; sanitize rendered output below with DOMPurify
    linkify: true,
    typographer: true,
    breaks: true,
  }).use(taskLists);

  md.core.ruler.after('inline', 'obsidian_block_references', (state) => {
    const nextTokens: Token[] = [];
    let lastRenderableOpenIndex: number | null = null;

    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      const inlineToken = state.tokens[index + 1];
      const closeToken = state.tokens[index + 2];

      const blockReferenceMatch = token.type === 'paragraph_open'
        && inlineToken?.type === 'inline'
        && closeToken?.type === 'paragraph_close'
        ? inlineToken.content.trim().match(/^\^([A-Za-z0-9_-]+)$/)
        : null;

      if (blockReferenceMatch) {
        if (lastRenderableOpenIndex !== null) {
          nextTokens[lastRenderableOpenIndex]?.attrSet('data-block-id', blockReferenceMatch[1]);
        }
        index += 2;
        continue;
      }

      const nextIndex = nextTokens.push(token) - 1;
      if (token.nesting === 1 && ['paragraph_open', 'heading_open', 'blockquote_open', 'list_item_open', 'table_open'].includes(token.type)) {
        lastRenderableOpenIndex = nextIndex;
      }
    }

    state.tokens = nextTokens;
  });

  const parseWikiSyntax = (state: MarkdownIt.StateInline, silent: boolean, embed: boolean) => {
    const start = state.pos;
    const source = state.src;
    const linkStart = embed ? start + 1 : start;

    if (embed) {
      if (source[start] !== '!' || source[start + 1] !== '[' || source[start + 2] !== '[') {
        return false;
      }
    } else if (source[linkStart] !== '[' || source[linkStart + 1] !== '[') {
      return false;
    }

    const end = source.indexOf(']]', linkStart + 2);
    if (end === -1) return false;

    const rawContent = source.slice(linkStart + 2, end).trim();
    if (!rawContent || rawContent.includes('\n')) return false;

    if (!silent) {
      const token = state.push(embed ? 'wikiembed' : 'wikilink', '', 0);
      token.content = rawContent;
    }

    state.pos = end + 2;
    return true;
  };

  md.inline.ruler.before('image', 'wikiembed', (state, silent) => parseWikiSyntax(state, silent, true));
  md.inline.ruler.before('link', 'wikilink', (state, silent) => parseWikiSyntax(state, silent, false));

  md.renderer.rules.wikilink = (tokens, idx) => {
    const rawContent = tokens[idx].content;
    const { target, displayText } = parseWikiLinkReference(rawContent);
    const escapedTarget = md.utils.escapeHtml(target);
    const escapedLabel = md.utils.escapeHtml(displayText || target);
    return `<a class="markdown-link markdown-wikilink" href="#" data-wikilink="${escapedTarget}">${escapedLabel}</a>`;
  };

  md.renderer.rules.wikiembed = (tokens, idx) => {
    const rawContent = tokens[idx].content;
    const { target, displayText, embedSize } = parseWikiLinkReference(rawContent, { embed: true });
    const escapedTarget = md.utils.escapeHtml(target);
    const escapedLabel = md.utils.escapeHtml(displayText || target);
    const sizeAttributes = [
      embedSize?.width ? ` data-wiki-width="${embedSize.width}"` : '',
      embedSize?.height ? ` data-wiki-height="${embedSize.height}"` : '',
    ].join('');
    return `<a class="markdown-link markdown-embed" href="#" data-wikilink="${escapedTarget}" data-wiki-embed="true" data-wiki-target="${escapedTarget}" data-wiki-label="${escapedLabel}"${sizeAttributes}>${escapedLabel}</a>`;
  };

  // Initialize extensions
  initKaTeX(md);
  initMermaid(md);

  const defaultImageRenderer = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet('decoding', 'sync');
    token.attrSet('loading', 'eager');
    token.attrSet('fetchpriority', 'high');

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
    // Store the original markdown-it fence renderer (before any Shiki wrapping)
    baseFenceRenderer = mdInstance.renderer.rules.fence || null;
  }
  return mdInstance;
}

// Store highlighter reference for the current render
let currentHighlighter: ShikiHighlighter | null = null;
let currentTheme: ThemeMode = 'light';

// LRU Cache for markdown rendering results
const markdownCache = new LRUCache<string, string>(30);
const MAX_CACHEABLE_LENGTH = 100000; // Don't cache very large documents

function canUseShikiLanguage(highlighter: ShikiHighlighter | null, lang: string): boolean {
  if (!highlighter || !lang) return false;

  const loadedLanguages = new Set<string>(highlighter.getLoadedLanguages?.() ?? []);
  if (loadedLanguages.has(lang)) return true;

  if (typeof highlighter.supportsLanguage === 'function') {
    return Boolean(highlighter.supportsLanguage(lang));
  }

  return false;
}

function configureFenceRenderer(md: MarkdownIt, highlighter: ShikiHighlighter | null, themeMode: ThemeMode = 'light') {
  // Always update current highlighter reference for the latest instance
  currentHighlighter = highlighter;
  currentTheme = themeMode;

  // Get the base fence renderer - this should be the original markdown-it fence renderer
  // We avoid using the current md.renderer.rules.fence to prevent wrapping ourselves
  const baseFence = baseFenceRenderer;

  // Create a local reference to the highlighter for this render call
  // This ensures we use the correct highlighter even in build mode
  const localHighlighter = highlighter;
  const localThemeMode = themeMode;

  // Always update the fence renderer to ensure it has access to the latest highlighter
  md.renderer.rules.fence = (tokens, idx, options, env: MarkdownRenderEnv, self) => {
    const token = tokens[idx];
    const rawLang = token.info.trim().split(/\s+/)[0] || '';
    const lang = normalizeShikiLanguage(rawLang);

    if (lang === 'mermaid' || lang === 'mmd') {
      return baseFence
        ? baseFence(tokens, idx, options, env, self)
        : `<pre><code class="language-${lang}">${md.utils.escapeHtml(token.content.trim())}</code></pre>`;
    }

    // Use the local highlighter reference for this specific render call
    // This is more reliable than the module-level variable in build mode
    const activeHighlighter = localHighlighter ?? currentHighlighter;
    const activeThemeMode = localThemeMode ?? currentTheme;

    if (activeHighlighter && lang && canUseShikiLanguage(activeHighlighter, lang)) {
      try {
        const activeTheme = getMarkdownPressShikiTheme(activeThemeMode);
        const shikiHtml = activeHighlighter.codeToHtml(token.content.trim(), { lang, theme: activeTheme });
        const shikiBlocks = env.shikiBlocks ?? (env.shikiBlocks = []);
        const blockIndex = shikiBlocks.push(shikiHtml) - 1;
        return `<div data-shiki-block="${blockIndex}"></div>`;
      } catch (error) {
        console.warn(`Shiki failed for ${lang}:`, error);
        // Log detailed error in build mode
        if (typeof window !== 'undefined') {
          console.warn('[Shiki Error Details]', {
            lang,
            theme: getMarkdownPressShikiTheme(activeThemeMode),
            hasHighlighter: !!activeHighlighter,
            highlighterMethods: Object.keys(activeHighlighter || {}),
          });
        }
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
export function useMarkdownRenderer(highlighter: ShikiHighlighter | null, themeMode: ThemeMode) {
  // Apply KaTeX theme
  useEffect(() => {
    applyKatexDarkTheme();
  }, [themeMode]);
}

interface RenderCacheKey {
  content: string;
  highlighter: boolean;
  themeMode: ThemeMode;
}

function createCacheKey(markdown: string, options: MarkdownRenderOptions): string {
  return `${hashContent(markdown)}_${options.highlighter ? '1' : '0'}_${options.themeMode ?? 'light'}`;
}

/**
 * Render markdown to HTML with sanitization and caching
 */
export function renderMarkdown(markdown: string, options: MarkdownRenderOptions = {}): string {
  // Check cache for non-large documents
  const shouldCache = markdown.length <= MAX_CACHEABLE_LENGTH;

  if (shouldCache) {
    const cacheKey = createCacheKey(markdown, options);
    const cached = markdownCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const md = getMarkdownIt();
  const highlighter = options.highlighter ?? null;
  const themeMode = options.themeMode ?? 'light';

  // Configure fence renderer with the highlighter
  configureFenceRenderer(md, highlighter, themeMode);

  const env: MarkdownRenderEnv = {};
  const renderedHtml = md.render(markdown, env);

  // Sanitize HTML to prevent XSS attacks
  const sanitizedHtml = DOMPurify.sanitize(renderedHtml, {
    ADD_TAGS: ['iframe'], // Allow iframe for embeds if needed
    // Preserve Shiki token styling while still sanitizing the rest of the HTML.
    ADD_ATTR: [
      'align',
      'allow',
      'allowfullscreen',
      'frameborder',
      'height',
      'scrolling',
      'style',
      'tabindex',
      'width',
      'data-wikilink',
      'data-wiki-embed',
      'data-wiki-target',
      'data-wiki-label',
      'data-wiki-width',
      'data-wiki-height',
      'data-block-id',
      'data-shiki-block',
    ],
  });

  const result = env.shikiBlocks?.length
    ? sanitizedHtml.replace(
        /<div data-shiki-block="(\d+)"><\/div>/g,
        (_match, blockIndex: string) => env.shikiBlocks?.[Number(blockIndex)] ?? ''
      )
    : sanitizedHtml;

  // Store in cache
  if (shouldCache) {
    const cacheKey = createCacheKey(markdown, options);
    markdownCache.set(cacheKey, result);
  }

  return result;
}

/**
 * Clear the markdown render cache
 */
export function clearMarkdownCache(): void {
  markdownCache.clear();
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
