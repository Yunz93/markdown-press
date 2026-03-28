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

interface MarkdownRenderOptions {
  highlighter?: any | null;
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

// Store highlighter reference for the current render
let currentHighlighter: any | null = null;
let currentTheme: ThemeMode = 'light';

function configureFenceRenderer(md: MarkdownIt, highlighter: any | null, themeMode: ThemeMode = 'light') {
  // Update current highlighter reference
  currentHighlighter = highlighter;
  currentTheme = themeMode;
  
  const baseFence = baseFenceRenderer || md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env: MarkdownRenderEnv, self) => {
    const token = tokens[idx];
    const rawLang = token.info.trim().split(/\s+/)[0] || '';
    const lang = normalizeShikiLanguage(rawLang);

    if (lang === 'mermaid' || lang === 'mmd') {
      return baseFence
        ? baseFence(tokens, idx, options, env, self)
        : `<pre><code class="language-${lang}">${md.utils.escapeHtml(token.content.trim())}</code></pre>`;
    }

    // Use the most recent highlighter reference
    const activeHighlighter = currentHighlighter || highlighter;
    
    if (activeHighlighter && lang) {
      try {
        const activeTheme = getMarkdownPressShikiTheme(currentTheme);
        const shikiHtml = activeHighlighter.codeToHtml(token.content.trim(), { lang, theme: activeTheme });
        const shikiBlocks = env.shikiBlocks ?? (env.shikiBlocks = []);
        const blockIndex = shikiBlocks.push(shikiHtml) - 1;
        return `<div data-shiki-block="${blockIndex}"></div>`;
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

  if (!env.shikiBlocks?.length) {
    return sanitizedHtml;
  }

  return sanitizedHtml.replace(
    /<div data-shiki-block="(\d+)"><\/div>/g,
    (_match, blockIndex: string) => env.shikiBlocks?.[Number(blockIndex)] ?? ''
  );
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
