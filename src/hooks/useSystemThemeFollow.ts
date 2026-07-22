import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store/appStore";
import type { ThemeMode } from "../types";
import { isTauriEnvironment } from "../types/filesystem";

function getBrowserSystemThemeMode(): ThemeMode {
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeModeIfNeeded(systemTheme: ThemeMode): void {
  const store = useAppStore.getState();
  if (!store.settings.themeFollowSystem) return;
  if (store.settings.themeMode === systemTheme) return;
  store.updateSettings({ themeMode: systemTheme });
}

/**
 * When "follow system theme" is enabled, keep `settings.themeMode` in sync
 * with the OS light/dark preference. The stored themeMode stays a concrete
 * "light" | "dark" value, so every consumer (editor, preview, export) keeps
 * working unchanged.
 *
 * On Tauri we release the forced window theme (`setTheme(null)`) and listen to
 * `onThemeChanged`, because a previously forced light/dark makes matchMedia
 * report the forced value instead of the real OS preference.
 */
export function useSystemThemeFollow(): void {
  const themeFollowSystem = useAppStore(
    (state) => state.settings.themeFollowSystem,
  );

  useEffect(() => {
    if (!themeFollowSystem) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    if (isTauriEnvironment()) {
      void (async () => {
        try {
          const currentWindow = getCurrentWindow();
          // Unlock OS-driven theme so subsequent reads reflect the real system preference.
          await currentWindow.setTheme(null);
          if (cancelled) return;

          const nativeTheme = await currentWindow.theme();
          if (cancelled) return;
          applyThemeModeIfNeeded(nativeTheme === "dark" ? "dark" : "light");

          unlisten = await currentWindow.onThemeChanged(({ payload }) => {
            applyThemeModeIfNeeded(payload === "dark" ? "dark" : "light");
          });
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn(
              "[useSystemThemeFollow] Native theme follow failed; falling back to matchMedia.",
              error,
            );
          }
          if (cancelled) return;
          applyThemeModeIfNeeded(getBrowserSystemThemeMode());
        }
      })();

      return () => {
        cancelled = true;
        unlisten?.();
      };
    }

    if (typeof window.matchMedia !== "function") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const applyFromMedia = () => {
      applyThemeModeIfNeeded(getBrowserSystemThemeMode());
    };

    applyFromMedia();
    query.addEventListener("change", applyFromMedia);
    return () => query.removeEventListener("change", applyFromMedia);
  }, [themeFollowSystem]);
}
