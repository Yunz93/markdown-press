import { useLayoutEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ThemeMode } from '../types';
import { isTauriEnvironment } from '../types/filesystem';

/**
 * Syncs the active theme to the DOM during render so descendants (e.g. preview layout effects,
 * KaTeX) see the same `html.dark` state as `settings.themeMode` in the same commit.
 *
 * Native chrome (`setTheme`) runs in `useLayoutEffect` so it is scheduled with this commit and
 * before paint, matching the DOM flip as closely as the async IPC allows (no `useEffect` + import lag).
 */
export function useThemeSync(themeMode: ThemeMode): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }

  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.setAttribute('data-theme-switching', 'true');
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          root.removeAttribute('data-theme-switching');
        });
        // ensure cleanup if unmounted before raf2
        (root as any).__themeSwitchRaf2 = raf2;
      });
      (root as any).__themeSwitchRaf1 = raf1;
    }

    if (!isTauriEnvironment()) return;

    void (async () => {
      try {
        await getCurrentWindow().setTheme(themeMode === 'dark' ? 'dark' : 'light');
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[useThemeSync] Native window theme sync failed.', error);
        }
      }
    })();

    return () => {
      if (typeof document === 'undefined') return;
      const root = document.documentElement as any;
      if (root.__themeSwitchRaf1) cancelAnimationFrame(root.__themeSwitchRaf1);
      if (root.__themeSwitchRaf2) cancelAnimationFrame(root.__themeSwitchRaf2);
      document.documentElement.removeAttribute('data-theme-switching');
    };
  }, [themeMode]);
}
