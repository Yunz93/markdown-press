import { useState, useEffect } from 'react';

interface ShikiHighlighter {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  getLoadedLanguages?: () => string[];
}

const LANGS = [
  'javascript', 'typescript', 'tsx', 'jsx', 'json', 'markdown',
  'html', 'css', 'bash', 'yaml', 'python', 'sql', 'java', 'go', 'rust',
];

/**
 * Lazily loads the Shiki syntax highlighter.
 * Extracted from App.tsx to keep the component clean.
 */
export function useShikiHighlighter() {
  const [highlighter, setHighlighter] = useState<ShikiHighlighter | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('shiki').then(({ createHighlighter }) => {
      if (typeof createHighlighter !== 'function') return;
      createHighlighter({ themes: ['github-light', 'github-dark'], langs: LANGS })
        .then((h) => { if (!cancelled) setHighlighter(h); })
        .catch((e) => console.error('Failed to load shiki', e));
    });
    return () => { cancelled = true; };
  }, []);

  return { highlighter };
}
