import { useEffect, useMemo, useState } from 'react';
import type { DynamicImportLanguageRegistration, LanguageInput } from 'shiki/core';
import { extractMarkdownFenceLanguages, SHIKI_CORE_LANGS } from '../utils/shikiLanguages';
import { MARKDOWN_PRESS_SHIKI_THEMES } from '../utils/shikiTheme';

/** Shiki highlighter interface for syntax highlighting */
export interface ShikiHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  getLoadedLanguages?: () => string[];
  loadLanguage?: (...langs: LanguageInput[]) => Promise<void>;
  supportsLanguage?: (lang: string) => boolean;
  /** Bumps when lazy-loaded languages change; use in markdown render cache keys. */
  __revision?: number;
}

let cachedHighlighter: ShikiHighlighter | null = null;
let cachedHighlighterPromise: Promise<ShikiHighlighter | null> | null = null;

function getBundledLanguageLoader(
  bundledLanguages: Record<string, unknown>,
  lang: string,
): LanguageInput | null {
  const loader = bundledLanguages[lang];
  return typeof loader === 'function' ? loader as DynamicImportLanguageRegistration : null;
}

async function createShikiHighlighter(): Promise<ShikiHighlighter | null> {
  try {
    const [{ createHighlighterCore }, { bundledLanguages }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/langs'),
      import('shiki/engine/javascript'),
    ]);

    const bundledLanguageIds = new Set(Object.keys(bundledLanguages ?? {}));
    const supportedLangs = SHIKI_CORE_LANGS.filter((lang) => bundledLanguageIds.has(lang));
    const initialLanguageLoaders = supportedLangs
      .map((lang) => getBundledLanguageLoader(bundledLanguages, lang))
      .filter((loader): loader is NonNullable<typeof loader> => Boolean(loader));

    if (supportedLangs.length !== SHIKI_CORE_LANGS.length) {
      const unsupportedLangs = SHIKI_CORE_LANGS.filter((lang) => !bundledLanguageIds.has(lang));
      console.warn('Skipping unsupported Shiki bundle languages:', unsupportedLangs);
    }

    const highlighter = await createHighlighterCore({
      themes: MARKDOWN_PRESS_SHIKI_THEMES,
      langs: initialLanguageLoaders,
      engine: createJavaScriptRegexEngine(),
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
    let cancelled = false;
    const unsupportedLanguages = extractMarkdownFenceLanguages(markdownContent)
      .filter((lang) => !supportsLanguage(lang));

    if (unsupportedLanguages.length > 0) {
      console.warn('Skipping Shiki languages not available in this bundle:', unsupportedLanguages);
    }

    const missingLanguages = extractMarkdownFenceLanguages(markdownContent)
      .filter((lang) => !loadedLanguages.has(lang) && supportsLanguage(lang));

    if (missingLanguages.length > 0) {
      void Promise.all([
        import('shiki/langs'),
      ]).then(([{ bundledLanguages }]) => {
        if (cancelled) return;

        const languageLoaders = missingLanguages
          .map((lang) => getBundledLanguageLoader(bundledLanguages, lang))
          .filter((loader): loader is NonNullable<typeof loader> => Boolean(loader));

        if (languageLoaders.length === 0) {
          return;
        }

        return highlighterInstance.loadLanguage?.(...languageLoaders);
      }).then(() => {
        if (!cancelled) {
          setHighlighterRevision((prev) => prev + 1);
        }
      }).catch((error) => {
        console.error('Failed to load additional Shiki languages:', missingLanguages, error);
      });
    }

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
