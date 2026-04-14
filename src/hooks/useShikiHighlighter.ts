import { useEffect, useMemo, useState } from 'react';
import { extractMarkdownFenceLanguages, SHIKI_CORE_LANGS } from '../utils/shikiLanguages';
import { MARKDOWN_PRESS_SHIKI_THEMES } from '../utils/shikiTheme';

/** Language input type for Shiki loadLanguage */
type LanguageInput = string | {
  name: string;
  displayName?: string;
  [key: string]: unknown;
};

/** Shiki highlighter interface for syntax highlighting */
export interface ShikiHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  getLoadedLanguages?: () => string[];
  loadLanguage?: (...langs: LanguageInput[]) => Promise<void>;
  supportsLanguage?: (lang: string) => boolean;
}

let cachedHighlighter: ShikiHighlighter | null = null;
let cachedHighlighterPromise: Promise<ShikiHighlighter | null> | null = null;

async function createShikiHighlighter(): Promise<ShikiHighlighter | null> {
  try {
    // Dynamic import to handle potential failures gracefully
    const shiki = await import('shiki/bundle/web');
    const { bundledLanguages, createHighlighter } = shiki;
    
    const bundledLanguageIds = new Set(Object.keys(bundledLanguages ?? {}));
    const supportedLangs = SHIKI_CORE_LANGS.filter((lang) => bundledLanguageIds.has(lang));

    if (supportedLangs.length !== SHIKI_CORE_LANGS.length) {
      const unsupportedLangs = SHIKI_CORE_LANGS.filter((lang) => !bundledLanguageIds.has(lang));
      console.warn('Skipping unsupported Shiki bundle languages:', unsupportedLangs);
    }

    const highlighter = await createHighlighter({
      themes: MARKDOWN_PRESS_SHIKI_THEMES,
      langs: supportedLangs,
    });
    
    return {
      codeToHtml: highlighter.codeToHtml.bind(highlighter),
      getLoadedLanguages: highlighter.getLoadedLanguages?.bind(highlighter),
      loadLanguage: highlighter.loadLanguage?.bind(highlighter) as ShikiHighlighter['loadLanguage'],
      supportsLanguage: (lang: string) => bundledLanguageIds.has(lang),
    };
  } catch (error) {
    console.error('Failed to initialize Shiki highlighter:', error);
    return null;
  }
}

function ensureHighlighter(): Promise<ShikiHighlighter | null> {
  if (cachedHighlighter) {
    return Promise.resolve(cachedHighlighter);
  }

  if (!cachedHighlighterPromise) {
    cachedHighlighterPromise = createShikiHighlighter()
      .then((highlighter) => {
        cachedHighlighter = highlighter;
        return highlighter;
      })
      .catch((error) => {
        console.error('Failed to load shiki:', error);
        cachedHighlighterPromise = null;
        return null;
      });
  }

  return cachedHighlighterPromise;
}

/**
 * Lazily loads the Shiki syntax highlighter.
 * Extracted from App.tsx to keep the component clean.
 * Uses singleton pattern to avoid re-creating in build mode.
 */
export function useShikiHighlighter(markdownContent = '') {
  const [highlighterInstance, setHighlighterInstance] = useState<ShikiHighlighter | null>(cachedHighlighter);
  const [highlighterRevision, setHighlighterRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void ensureHighlighter().then((highlighter) => {
      if (!highlighter || cancelled) return;
      setHighlighterInstance(highlighter);
      setHighlighterRevision((prev) => prev + 1);
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!highlighterInstance?.loadLanguage || !markdownContent) return;

    const supportsLanguage = highlighterInstance.supportsLanguage ?? (() => true);
    const loadedLanguages = new Set(highlighterInstance.getLoadedLanguages?.() ?? []);
    const missingLanguages = extractMarkdownFenceLanguages(markdownContent)
      .filter((lang) => !loadedLanguages.has(lang) && supportsLanguage(lang));
    const unsupportedLanguages = extractMarkdownFenceLanguages(markdownContent)
      .filter((lang) => !supportsLanguage(lang));

    if (unsupportedLanguages.length > 0) {
      console.warn('Skipping Shiki languages not available in this bundle:', unsupportedLanguages);
    }

    if (missingLanguages.length === 0) return;

    let cancelled = false;
    highlighterInstance.loadLanguage(...missingLanguages)
      .then(() => {
        if (!cancelled) {
          setHighlighterRevision((prev) => prev + 1);
        }
      })
      .catch((error) => {
        console.error('Failed to load additional Shiki languages:', missingLanguages, error);
      });

    return () => {
      cancelled = true;
    };
  }, [highlighterInstance, markdownContent]);

  const highlighter = useMemo(() => {
    if (!highlighterInstance) {
      return null;
    }

    return {
      codeToHtml: highlighterInstance.codeToHtml.bind(highlighterInstance),
      getLoadedLanguages: highlighterInstance.getLoadedLanguages?.bind(highlighterInstance),
      loadLanguage: highlighterInstance.loadLanguage?.bind(highlighterInstance),
      supportsLanguage: highlighterInstance.supportsLanguage?.bind(highlighterInstance),
      __revision: highlighterRevision,
    };
  }, [highlighterInstance, highlighterRevision]);

  return { highlighter };
}
