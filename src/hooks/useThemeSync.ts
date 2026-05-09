import { useEffect } from 'react';
import type { ThemeMode } from '../types';
import { isTauriEnvironment } from '../types/filesystem';

/**
 * Syncs the active theme to the DOM during render so descendants (e.g. preview layout effects,
 * KaTeX) see the same `html.dark` state as `settings.themeMode` in the same commit.
 *
 * A post-paint `useEffect` runs too late: child layout/effects can observe a stale class until the
 * user toggles theme again.
 */
export function useThemeSync(themeMode: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }

  useEffect(() => {
    if (!isTauriEnvironment()) return;

    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setTheme(themeMode === 'dark' ? 'dark' : 'light');
      } catch {
        // Web build or API unavailable
      }
    })();
  }, [themeMode]);
}
