import { useEffect } from 'react';

/**
 * Syncs the active theme to the DOM (dark class + custom CSS style tag).
 * Extracted from App.tsx to keep the component clean.
 */
export function useThemeSync(themeMode: string, customCss: string) {
  useEffect(() => {
    const isDark = themeMode === 'dark' || themeMode === 'solarized-dark';
    document.documentElement.classList.toggle('dark', isDark);

    const styleId = 'theme-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = themeMode === 'custom' ? customCss : '';
  }, [themeMode, customCss]);
}
