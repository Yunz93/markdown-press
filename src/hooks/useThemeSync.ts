import { useLayoutEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ThemeMode } from "../types";
import { isTauriEnvironment } from "../types/filesystem";

/**
 * Syncs the active theme to the DOM during render so descendants (e.g. preview layout effects,
 * KaTeX) see the same `html.dark` state as `settings.themeMode` in the same commit.
 *
 * Native chrome (`setTheme`) runs in `useLayoutEffect`. When following the OS theme we must pass
 * `null` so Tauri stops forcing light/dark — otherwise `prefers-color-scheme` / `window.theme()`
 * keep reflecting the last forced value and "跟随系统" appears broken.
 */
export function useThemeSync(
  themeMode: ThemeMode,
  themeFollowSystem = false,
): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }

  useLayoutEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.setAttribute("data-theme-switching", "true");
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          root.removeAttribute("data-theme-switching");
        });
        // ensure cleanup if unmounted before raf2
        (root as any).__themeSwitchRaf2 = raf2;
      });
      (root as any).__themeSwitchRaf1 = raf1;
    }

    if (!isTauriEnvironment()) return;

    void (async () => {
      try {
        await getCurrentWindow().setTheme(
          themeFollowSystem ? null : themeMode === "dark" ? "dark" : "light",
        );
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(
            "[useThemeSync] Native window theme sync failed.",
            error,
          );
        }
      }
    })();

    return () => {
      if (typeof document === "undefined") return;
      const root = document.documentElement as any;
      if (root.__themeSwitchRaf1) cancelAnimationFrame(root.__themeSwitchRaf1);
      if (root.__themeSwitchRaf2) cancelAnimationFrame(root.__themeSwitchRaf2);
      document.documentElement.removeAttribute("data-theme-switching");
    };
  }, [themeMode, themeFollowSystem]);
}
