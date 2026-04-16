import type { ThemeMode } from '../types';

/**
 * Syncs the active theme to the DOM during render so descendants (e.g. preview layout effects,
 * KaTeX) see the same `html.dark` state as `settings.themeMode` in the same commit.
 *
 * A post-paint `useEffect` runs too late: child layout/effects can observe a stale class until the
 * user toggles theme again.
 */
export function useThemeSync(themeMode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', themeMode === 'dark');
}
