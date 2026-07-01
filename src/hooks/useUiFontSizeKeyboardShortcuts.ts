import { useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { isShortcutCaptureActive } from "../utils/shortcutCaptureGate";
import { getUiFontSizeZoomDelta, stepUiFontSize } from "../utils/uiFontSize";

export function useUiFontSizeKeyboardShortcuts(): void {
  const updateSettings = useAppStore((state) => state.updateSettings);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isShortcutCaptureActive()) {
        return;
      }

      const delta = getUiFontSizeZoomDelta(event);
      if (delta === 0) {
        return;
      }

      event.preventDefault();

      updateSettings((state) => {
        const current = state.settings.uiFontSize;
        const next = stepUiFontSize(current, delta);
        if (next === current) {
          return {};
        }

        return { uiFontSize: next };
      });
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [updateSettings]);
}
