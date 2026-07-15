import { useEffect } from "react";
import { useAppStore } from "../store/appStore";
import type { ThemeMode } from "../types";

function getSystemThemeMode(query: MediaQueryList): ThemeMode {
  return query.matches ? "dark" : "light";
}

/**
 * When "follow system theme" is enabled, keep `settings.themeMode` in sync
 * with the OS light/dark preference. The stored themeMode stays a concrete
 * "light" | "dark" value, so every consumer (editor, preview, export) keeps
 * working unchanged.
 */
export function useSystemThemeFollow(): void {
  const themeFollowSystem = useAppStore(
    (state) => state.settings.themeFollowSystem,
  );

  useEffect(() => {
    if (!themeFollowSystem) return;
    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const applySystemTheme = () => {
      const systemTheme = getSystemThemeMode(query);
      const store = useAppStore.getState();
      if (store.settings.themeMode !== systemTheme) {
        store.updateSettings({ themeMode: systemTheme });
      }
    };

    applySystemTheme();
    query.addEventListener("change", applySystemTheme);
    return () => query.removeEventListener("change", applySystemTheme);
  }, [themeFollowSystem]);
}
