import { useEffect } from 'react';
import type { ThemeMode } from '../types';

/**
 * Syncs the active theme to the DOM.
 * Extracted from App.tsx to keep the component clean.
 */
export function useThemeSync(themeMode: ThemeMode) {
  useEffect(() => {
    const isDark = themeMode === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
  }, [themeMode]);
}
