import { useEffect } from "react";
import { useAppStore, defaultSettings } from "../store/appStore";
import { isShortcutCaptureActive } from "../utils/shortcutCaptureGate";
import {
  getUiFontScalePercent,
  getUiFontSizeZoomDelta,
  isUiFontSizeResetShortcut,
  stepUiFontSize,
} from "../utils/uiFontSize";

export function useUiFontSizeKeyboardShortcuts(): void {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const showUiZoomHint = useAppStore((state) => state.showUiZoomHint);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isShortcutCaptureActive()) {
        return;
      }

      if (isUiFontSizeResetShortcut(event)) {
        event.preventDefault();
        updateSettings({ uiFontSize: defaultSettings.uiFontSize });
        showUiZoomHint(getUiFontScalePercent(defaultSettings.uiFontSize));
        return;
      }

      const delta = getUiFontSizeZoomDelta(event);
      if (delta === 0) {
        return;
      }

      event.preventDefault();

      let nextUiFontSize: number | null = null;

      updateSettings((state) => {
        const current = state.settings.uiFontSize;
        const next = stepUiFontSize(current, delta);
        if (next === current) {
          return {};
        }

        nextUiFontSize = next;
        return { uiFontSize: next };
      });

      if (nextUiFontSize !== null) {
        showUiZoomHint(getUiFontScalePercent(nextUiFontSize));
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [showUiZoomHint, updateSettings]);
}
