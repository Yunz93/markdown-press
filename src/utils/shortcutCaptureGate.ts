let shortcutCaptureActive = false;

/** While true, global app shortcuts should ignore key events (settings shortcut recorder). */
export function isShortcutCaptureActive(): boolean {
  return shortcutCaptureActive;
}

export function setShortcutCaptureActive(active: boolean): void {
  shortcutCaptureActive = active;
}
