import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { ViewMode } from '../types';

interface UseKeyboardShortcutsOptions {
  onSave?: () => void;
  onToggleView?: () => void;
  onAIAnalyze?: () => void;
  onSearch?: () => void;
  onOpenSettings?: () => void;
}

// Parse shortcut string like "Ctrl+S" into structured format
const parseShortcut = (shortcut: string) => {
  const parts = shortcut.toLowerCase().split('+').map(p => p.trim());
  return {
    hasCtrl: parts.includes('ctrl') || parts.includes('meta'),
    hasShift: parts.includes('shift'),
    hasAlt: parts.includes('alt'),
    key: parts.find(p => !['ctrl', 'meta', 'shift', 'alt'].includes(p))
  };
};

// Check if current key event matches shortcut
const matchesShortcut = (event: KeyboardEvent, shortcut: string) => {
  const shortcutConfig = parseShortcut(shortcut);

  const isMod = event.ctrlKey || event.metaKey;
  if (shortcutConfig.hasCtrl && !isMod) return false;
  if (!shortcutConfig.hasCtrl && isMod) return false;
  if (shortcutConfig.hasShift && !event.shiftKey) return false;
  if (shortcutConfig.hasAlt && !event.altKey) return false;
  if (!shortcutConfig.key) return false;

  return event.key.toLowerCase() === shortcutConfig.key;
};

/**
 * Hook for keyboard shortcuts management
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { onSave, onToggleView, onAIAnalyze, onSearch, onOpenSettings } = options;

  const {
    settings,
    viewMode,
    setViewMode,
    showNotification
  } = useAppStore();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const isMod = event.ctrlKey || event.metaKey;
    if (!isMod) return;

    const shortcuts = settings.shortcuts;

    // Check save shortcut
    if (matchesShortcut(event, shortcuts.save)) {
      event.preventDefault();
      if (onSave) {
        onSave();
        showNotification('Saved', 'success');
      }
      return;
    }

    // Check toggle view shortcut
    if (matchesShortcut(event, shortcuts.toggleView)) {
      event.preventDefault();
      if (onToggleView) {
        onToggleView();
      } else {
        // Default toggle behavior
        setViewMode(viewMode === ViewMode.PREVIEW ? ViewMode.EDITOR :
                    viewMode === ViewMode.EDITOR ? ViewMode.PREVIEW : ViewMode.SPLIT);
      }
      return;
    }

    // Check AI analyze shortcut
    if (matchesShortcut(event, shortcuts.aiAnalyze)) {
      event.preventDefault();
      if (onAIAnalyze) {
        onAIAnalyze();
      }
      return;
    }

    // Check search shortcut
    if (matchesShortcut(event, shortcuts.search)) {
      event.preventDefault();
      onSearch?.();
      return;
    }

    // Check open settings shortcut
    if (matchesShortcut(event, shortcuts.settings)) {
      event.preventDefault();
      onOpenSettings?.();
      return;
    }
  }, [settings.shortcuts, onSave, onToggleView, onAIAnalyze, onSearch, onOpenSettings, viewMode, setViewMode, showNotification]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Hook for global keyboard shortcuts (for App-level shortcuts)
 */
export function useGlobalKeyboardShortcuts(
  executeSave: () => Promise<void>,
  handleAIAnalyze: () => Promise<void>,
  onSearch?: () => void,
  onOpenSettings?: () => void
) {
  const { settings, viewMode, setViewMode, showNotification } = useAppStore();

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const shortcuts = settings.shortcuts;

      // Save: Ctrl+S
      if (matchesShortcut(e, shortcuts.save)) {
        e.preventDefault();
        executeSave().then(() => showNotification('Saved', 'success'));
      }
      // Toggle view: Ctrl+E
      else if (matchesShortcut(e, shortcuts.toggleView)) {
        e.preventDefault();
        setViewMode(viewMode === ViewMode.PREVIEW ? ViewMode.EDITOR :
                    viewMode === ViewMode.EDITOR ? ViewMode.PREVIEW : ViewMode.SPLIT);
      }
      // AI Analyze: Ctrl+J
      else if (matchesShortcut(e, shortcuts.aiAnalyze)) {
        e.preventDefault();
        handleAIAnalyze();
      }
      // Search: Ctrl+F (default)
      else if (matchesShortcut(e, shortcuts.search)) {
        e.preventDefault();
        onSearch?.();
      }
      // Open settings: Ctrl+0 (default)
      else if (matchesShortcut(e, shortcuts.settings)) {
        e.preventDefault();
        onOpenSettings?.();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [executeSave, handleAIAnalyze, onSearch, onOpenSettings, settings.shortcuts, viewMode, setViewMode, showNotification]);
}
