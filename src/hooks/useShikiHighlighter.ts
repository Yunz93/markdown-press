import { useEffect, useMemo, useState } from 'react';
import { bundledLanguages, createHighlighter } from 'shiki/bundle/web';
import { extractMarkdownFenceLanguages, SHIKI_CORE_LANGS } from '../utils/shikiLanguages';
import { MARKDOWN_PRESS_SHIKI_THEMES } from '../utils/shikiTheme';

interface ShikiHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  getLoadedLanguages?: () => string[];
  loadLanguage?: (...langs: any[]) => Promise<void>;
}

const bundledLanguageIds = new Set(Object.keys(bundledLanguages ?? {}));
let cachedHighlighter: ShikiHighlighter | null = null;
let cachedHighlighterPromise: Promise<ShikiHighlighter | null> | null = null;

function getSupportedLanguages(): string[] {
  const supportedLangs = SHIKI_CORE_LANGS.filter((lang) => bundledLanguageIds.has(lang));

  if (supportedLangs.length !== SHIKI_CORE_LANGS.length) {
    const unsupportedLangs = SHIKI_CORE_LANGS.filter((lang) => !bundledLanguageIds.has(lang));
    console.warn('Skipping unsupported Shiki bundle languages:', unsupportedLangs);
  }

  return supportedLangs;
}

function ensureHighlighter(): Promise<ShikiHighlighter | null> {
  if (cachedHighlighter) {
    return Promise.resolve(cachedHighlighter);
  }

  if (!cachedHighlighterPromise) {
    cachedHighlighterPromise = createHighlighter({
      themes: MARKDOWN_PRESS_SHIKI_THEMES,
      langs: getSupportedLanguages(),
    })
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

    const loadedLanguages = new Set(highlighterInstance.getLoadedLanguages?.() ?? []);
    const missingLanguages = extractMarkdownFenceLanguages(markdownContent)
      .filter((lang) => bundledLanguageIds.has(lang))
      .filter((lang) => !loadedLanguages.has(lang));

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
      __revision: highlighterRevision,
    };
  }, [highlighterInstance, highlighterRevision]);

  return { highlighter };
}
