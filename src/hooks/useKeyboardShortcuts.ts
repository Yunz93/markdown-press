import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { ViewMode, type ShortcutConfig } from '../types';

interface UseKeyboardShortcutsOptions {
  onSave?: () => void;
  onToggleView?: () => void;
  onAIAnalyze?: () => void;
  onSearch?: () => void;
  onSidebarSearch?: () => void;
  onOpenSettings?: () => void;
  onToggleOutline?: () => void;
  onToggleSidebar?: () => void;
  onToggleTheme?: () => void;
  onNewNote?: () => void;
  onNewFolder?: () => void;
  onCloseTab?: () => void;
  onOpenKnowledgeBase?: () => void;
  onExportHtml?: () => void;
}

const EDITABLE_SAFE_SHORTCUTS = new Set<keyof ShortcutConfig>([
  'save',
  'toggleView',
  'aiAnalyze',
  'search',
  'sidebarSearch',
  'settings',
  'toggleOutline',
  'toggleSidebar',
  'toggleTheme',
  'openKnowledgeBase',
  'exportHtml',
  'closeTab',
]);

function getNextViewMode(viewMode: ViewMode): ViewMode {
  if (viewMode === ViewMode.EDITOR) return ViewMode.SPLIT;
  if (viewMode === ViewMode.SPLIT) return ViewMode.PREVIEW;
  return ViewMode.EDITOR;
}

function normalizeKeyName(key: string): string {
  const normalized = key.trim().toLowerCase();
  if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') return 'meta';
  if (normalized === 'ctrl' || normalized === 'control') return 'ctrl';
  if (normalized === 'option') return 'alt';
  if (normalized === 'esc') return 'escape';
  if (normalized === 'comma') return ',';
  if (normalized === 'period') return '.';
  if (normalized === 'slash') return '/';
  return normalized;
}

function normalizeCodeName(code: string): string {
  const normalized = code.trim().toLowerCase();
  if (normalized === 'comma') return ',';
  if (normalized === 'period') return '.';
  if (normalized === 'slash') return '/';
  if (normalized.startsWith('key') && normalized.length === 4) {
    return normalized.slice(3);
  }
  if (normalized.startsWith('digit') && normalized.length === 6) {
    return normalized.slice(5);
  }
  return normalized;
}

function parseShortcut(shortcut: string) {
  const parts = shortcut.split('+').map((part) => normalizeKeyName(part));
  const key = parts.find((part) => !['ctrl', 'meta', 'shift', 'alt'].includes(part)) ?? '';

  return {
    key,
    ctrl: parts.includes('ctrl') || parts.includes('meta'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut.trim()) return false;

  const parsed = parseShortcut(shortcut);
  const isMod = event.ctrlKey || event.metaKey;

  if (parsed.ctrl !== isMod) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  if (!parsed.key) return false;

  return normalizeKeyName(event.key) === parsed.key || normalizeCodeName(event.code) === parsed.key;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  return element.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function createShortcutMap(shortcuts: ShortcutConfig, handlers: Record<keyof ShortcutConfig, (() => void) | undefined>) {
  return (Object.keys(shortcuts) as Array<keyof ShortcutConfig>).map((key) => ({
    action: key,
    shortcut: shortcuts[key],
    handler: handlers[key],
    allowInEditable: EDITABLE_SAFE_SHORTCUTS.has(key),
  }));
}

function useShortcutListener(options: UseKeyboardShortcutsOptions, saveHandler?: (() => void) | null) {
  const { settings, viewMode, setViewMode } = useAppStore();

  return useCallback((event: KeyboardEvent) => {
    const shortcutEntries = createShortcutMap(settings.shortcuts, {
      save: saveHandler ?? options.onSave,
      toggleView: options.onToggleView ?? (() => setViewMode(getNextViewMode(viewMode))),
      aiAnalyze: options.onAIAnalyze,
      search: options.onSearch,
      sidebarSearch: options.onSidebarSearch,
      settings: options.onOpenSettings,
      toggleOutline: options.onToggleOutline,
      toggleSidebar: options.onToggleSidebar,
      toggleTheme: options.onToggleTheme,
      newNote: options.onNewNote,
      newFolder: options.onNewFolder,
      closeTab: options.onCloseTab,
      openKnowledgeBase: options.onOpenKnowledgeBase,
      exportHtml: options.onExportHtml,
    });

    for (const entry of shortcutEntries) {
      if (!entry.handler || !matchesShortcut(event, entry.shortcut)) {
        continue;
      }

      // Only block shortcuts that should stay local to text inputs.
      if (isEditableTarget(event.target) && !entry.allowInEditable) {
        continue;
      }

      event.preventDefault();
      entry.handler();
      return;
    }
  }, [
    options.onAIAnalyze,
    options.onCloseTab,
    options.onExportHtml,
    options.onNewFolder,
    options.onNewNote,
    options.onOpenKnowledgeBase,
    options.onOpenSettings,
    options.onSave,
    options.onSearch,
    options.onSidebarSearch,
    options.onToggleOutline,
    options.onToggleSidebar,
    options.onToggleTheme,
    options.onToggleView,
    settings.shortcuts,
    setViewMode,
    viewMode,
    saveHandler,
  ]);
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const handleKeyDown = useShortcutListener(options, null);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);
}

export function useGlobalKeyboardShortcuts(
  executeSave: () => Promise<void>,
  handleAIAnalyze: () => Promise<void>,
  options: Omit<UseKeyboardShortcutsOptions, 'onSave' | 'onAIAnalyze'> = {}
) {
  const handleKeyDown = useShortcutListener({
    ...options,
    onAIAnalyze: () => { void handleAIAnalyze(); },
  }, () => {
    void executeSave();
  });

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);
}
