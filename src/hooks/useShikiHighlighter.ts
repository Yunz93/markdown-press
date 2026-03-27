import { useEffect, useMemo, useRef, useState } from 'react';
import { extractMarkdownFenceLanguages, SHIKI_CORE_LANGS } from '../utils/shikiLanguages';

interface ShikiHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  getLoadedLanguages?: () => string[];
  loadLanguage?: (...langs: string[]) => Promise<void>;
}

interface ShikiModule {
  bundledLanguages?: Record<string, unknown>;
  createHighlighter?: (options: { themes: string[]; langs: string[] }) => Promise<ShikiHighlighter>;
}

// Cache for Shiki highlighter to avoid re-creating in build mode
let cachedHighlighter: ShikiHighlighter | null = null;

async function importShikiModule(): Promise<ShikiModule | null> {
  // Try multiple import paths for better compatibility in dev/build modes
  const importPaths = [
    'shiki/bundle/web',
    'shiki/dist/bundle/web',
    'shiki',
  ];
  
  for (const path of importPaths) {
    try {
      const module = await import(/* @vite-ignore */ path);
      // Handle both ESM default export and direct exports
      return module.default || module;
    } catch (err) {
      console.debug(`Failed to import shiki from ${path}:`, err);
    }
  }
  
  console.error('Failed to import shiki from all known entrypoints.');
  return null;
}

/**
 * Lazily loads the Shiki syntax highlighter.
 * Extracted from App.tsx to keep the component clean.
 * Uses singleton pattern to avoid re-creating in build mode.
 */
export function useShikiHighlighter(markdownContent = '') {
  const [highlighterInstance, setHighlighterInstance] = useState<ShikiHighlighter | null>(cachedHighlighter);
  const [highlighterRevision, setHighlighterRevision] = useState(0);
  const bundledLanguageIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // Use cached instance if available
    if (cachedHighlighter && !isInitializedRef.current) {
      isInitializedRef.current = true;
      setHighlighterInstance(cachedHighlighter);
      setHighlighterRevision((prev) => prev + 1);
      return;
    }
    
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    
    let cancelled = false;
    importShikiModule().then((module) => {
      if (!module || cancelled) return;
      
      const { bundledLanguages, createHighlighter } = module;
      if (typeof createHighlighter !== 'function') {
        console.error('Shiki module does not export createHighlighter');
        return;
      }
      
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
            cachedHighlighter = h; // Cache for future use
            setHighlighterInstance(h);
            setHighlighterRevision((prev) => prev + 1);
          }
        })
        .catch((e) => console.error('Failed to load shiki:', e));
    });

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
