import type { ShortcutConfig } from '../types';

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

export function getPreferredShortcutModifierToken(): 'Cmd' | 'Ctrl' {
  return isMacPlatform() ? 'Cmd' : 'Ctrl';
}

export function getDisplayShortcutModifierLabel(): 'Cmd' | 'Ctrl' {
  return isMacPlatform() ? 'Cmd' : 'Ctrl';
}

export function normalizeShortcutForPlatform(shortcut: string): string {
  const preferred = getPreferredShortcutModifierToken();
  return shortcut
    .split('+')
    .map((part) => {
      const normalized = part.trim().toLowerCase();
      if (normalized === 'ctrl' || normalized === 'control' || normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
        return preferred;
      }
      return part.trim();
    })
    .filter(Boolean)
    .join('+');
}

export function normalizeShortcutConfigForPlatform(shortcuts: ShortcutConfig): ShortcutConfig {
  return Object.fromEntries(
    Object.entries(shortcuts).map(([key, value]) => [key, normalizeShortcutForPlatform(value)])
  ) as unknown as ShortcutConfig;
}

export function formatShortcutForDisplay(shortcut: string): string {
  const displayModifier = getDisplayShortcutModifierLabel();
  return shortcut
    .split('+')
    .map((part) => {
      const normalized = part.trim().toLowerCase();
      if (normalized === 'ctrl' || normalized === 'control' || normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
        return displayModifier;
      }
      return part.trim();
    })
    .filter(Boolean)
    .join('+');
}
