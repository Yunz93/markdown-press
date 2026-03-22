import { useEffect, useMemo, useRef, useState } from 'react';
import { extractMarkdownFenceLanguages, SHIKI_CORE_LANGS } from '../utils/shikiLanguages';

interface ShikiHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  getLoadedLanguages?: () => string[];
  loadLanguage?: (...langs: string[]) => Promise<void>;
}

/**
 * Lazily loads the Shiki syntax highlighter.
 * Extracted from App.tsx to keep the component clean.
 */
export function useShikiHighlighter(markdownContent = '') {
  const [highlighterInstance, setHighlighterInstance] = useState<ShikiHighlighter | null>(null);
  const [highlighterRevision, setHighlighterRevision] = useState(0);
  const bundledLanguageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    import('shiki').then(({ bundledLanguages, createHighlighter }) => {
      if (typeof createHighlighter !== 'function') return;
      const bundledLanguageIds = new Set(Object.keys(bundledLanguages ?? {}));
      bundledLanguageIdsRef.current = bundledLanguageIds;
      const supportedLangs = SHIKI_CORE_LANGS.filter((lang) => bundledLanguageIds.has(lang));

      if (supportedLangs.length !== SHIKI_CORE_LANGS.length) {
        const unsupportedLangs = SHIKI_CORE_LANGS.filter((lang) => !bundledLanguageIds.has(lang));
        console.warn('Skipping unsupported Shiki bundle languages:', unsupportedLangs);
      }

      createHighlighter({ themes: ['github-light', 'github-dark'], langs: supportedLangs })
        .then((h) => {
          if (!cancelled) {
            setHighlighterInstance(h);
            setHighlighterRevision((prev) => prev + 1);
          }
        })
        .catch((e) => console.error('Failed to load shiki', e));
    }).catch((e) => console.error('Failed to import shiki', e));

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!highlighterInstance?.loadLanguage || !markdownContent) return;

    const supportedLanguages = bundledLanguageIdsRef.current;
    if (supportedLanguages.size === 0) return;

    const loadedLanguages = new Set(highlighterInstance.getLoadedLanguages?.() ?? []);
    const missingLanguages = extractMarkdownFenceLanguages(markdownContent)
      .filter((lang) => supportedLanguages.has(lang))
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
