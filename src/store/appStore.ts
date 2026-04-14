import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createFileSlice, type FileState, type FileActions, initialFileState } from './fileStore';
import { createTabSlice, type TabState, type TabActions, initialTabState } from './tabStore';
import { createEditorSlice, type EditorState, type EditorActions, initialEditorState, selectContent } from './editorStore';
import { createUISlice, type UIState, type UIActions, initialUIState, defaultSettings, normalizeLanguage, normalizeThemeMode } from './uiStore';
import { ViewMode, type FileNode, type AppSettings, type Notification } from '../types';
import type { HeadingNode } from '../utils/outline';
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_PREVIEW_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  normalizeStoredCodeFontFamily,
  normalizeStoredEditorFontFamily,
  normalizeStoredPreviewFontFamily,
  normalizeStoredUiFontFamily,
} from '../utils/fontSettings';
import { normalizeBlogRepoUrl, normalizeBlogSiteUrl } from '../utils/blogRepo';
import { normalizeMetadataFields } from '../utils/metadataFields';
import { normalizeTrashFolder } from '../utils/trashFolder';
import { normalizeShortcutConfigForPlatform } from '../utils/shortcuts';

// Re-export types from slice stores
export type { FileState, FileActions, TabState, TabActions, EditorState, EditorActions, UIState, UIActions };
// Re-export selector for convenience
export { selectContent };

// Complete AppState combines all slices
export interface AppState extends
  FileState,
  TabState,
  EditorState,
  UIState,
  FileActions,
  TabActions,
  EditorActions,
  UIActions {}

const SENSITIVE_SETTING_KEYS = ['blogGithubToken', 'geminiApiKey', 'codexApiKey'] as const;

function clampPersistedNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function resolveFirstValidNumber(
  settings: Record<string, unknown>, keys: string[], min: number, max: number, fallback: number,
): number {
  for (const key of keys) {
    const v = settings[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return Math.min(max, Math.max(min, v));
    }
  }
  return fallback;
}

function resolveFirstValidString(settings: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = settings[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

function stripSensitiveSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...settings };
  SENSITIVE_SETTING_KEYS.forEach((key) => {
    delete sanitized[key];
  });
  return sanitized;
}

function sanitizeSettingsForPersistence(settings: AppSettings): AppSettings {
  const sanitized = { ...settings };
  SENSITIVE_SETTING_KEYS.forEach((key) => {
    delete sanitized[key];
  });
  return sanitized;
}

function resolvePersistedBlogRepoUrl(persistedSettings: Record<string, unknown>): string {
  if (typeof persistedSettings.blogRepoUrl === 'string') {
    const normalized = normalizeBlogRepoUrl(persistedSettings.blogRepoUrl);
    if (normalized) {
      return normalized;
    }
  }

  if (typeof persistedSettings.simpleBlogPath === 'string') {
    const normalized = normalizeBlogRepoUrl(persistedSettings.simpleBlogPath);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function resolvePersistedBlogSiteUrl(persistedSettings: Record<string, unknown>): string {
  if (typeof persistedSettings.blogSiteUrl === 'string') {
    return normalizeBlogSiteUrl(persistedSettings.blogSiteUrl);
  }

  return '';
}

function looksLikeGeminiModel(value: unknown): boolean {
  return typeof value === 'string' && /^gemini(?:-|$)/i.test(value.trim());
}

function looksLikeOpenAIModel(value: unknown): boolean {
  return typeof value === 'string' && /^(gpt-|o[1-9]\b|o[1-9]-|codex\b)/i.test(value.trim());
}

function resolvePersistedAISettings(persistedSettings: Record<string, unknown>) {
  const persistedProvider = typeof persistedSettings.aiProvider === 'string'
    ? persistedSettings.aiProvider
    : '';
  const persistedGeminiModel = typeof persistedSettings.geminiModel === 'string'
    ? persistedSettings.geminiModel.trim()
    : '';
  const persistedCodexModel = typeof persistedSettings.codexModel === 'string'
    ? persistedSettings.codexModel.trim()
    : '';

  if (persistedProvider === 'codex' || persistedProvider === 'gemini') {
    return {
      aiProvider: persistedProvider,
      codexModel: persistedCodexModel || (persistedProvider === 'codex' && looksLikeOpenAIModel(persistedGeminiModel)
        ? persistedGeminiModel
        : defaultSettings.codexModel),
      geminiModel: persistedGeminiModel || defaultSettings.geminiModel,
    };
  }

  if (!persistedCodexModel && looksLikeOpenAIModel(persistedGeminiModel)) {
    return {
      aiProvider: 'codex',
      codexModel: persistedCodexModel || persistedGeminiModel || defaultSettings.codexModel,
      geminiModel: looksLikeGeminiModel(persistedGeminiModel) ? persistedGeminiModel : defaultSettings.geminiModel,
    };
  }

  return {
    aiProvider: 'gemini',
    codexModel: persistedCodexModel || defaultSettings.codexModel,
    geminiModel: persistedGeminiModel || defaultSettings.geminiModel,
  };
}

function resolvePersistedShortcuts(persistedSettings: Record<string, unknown>) {
  const persistedShortcuts =
    persistedSettings.shortcuts && typeof persistedSettings.shortcuts === 'object'
      ? persistedSettings.shortcuts as Record<string, unknown>
      : {};

  const mergedShortcuts = {
    ...defaultSettings.shortcuts,
    ...persistedShortcuts,
  };

  const defaultShortcutMigrations: Partial<Record<keyof typeof mergedShortcuts, string[]>> = {
    toggleView: ['Ctrl+E'],
    search: ['Ctrl+F'],
    sidebarSearch: ['Ctrl+Shift+F'],
    settings: ['Ctrl+,', 'Cmd+,', 'Command+,', 'Meta+,'],
    toggleOutline: ['Ctrl+O'],
    toggleSidebar: ['Ctrl+B'],
    toggleTheme: ['Ctrl+T'],
    openKnowledgeBase: ['Ctrl+Shift+O'],
    exportPdf: ['Ctrl+Shift+E'],
  };

  (Object.keys(defaultShortcutMigrations) as Array<keyof typeof mergedShortcuts>).forEach((key) => {
    const persistedValue = persistedShortcuts[key];
    const legacyValues = defaultShortcutMigrations[key] ?? [];

    if (persistedValue === undefined || (typeof persistedValue === 'string' && legacyValues.includes(persistedValue))) {
      mergedShortcuts[key] = defaultSettings.shortcuts[key];
    }
  });

  return normalizeShortcutConfigForPlatform(mergedShortcuts);
}

/**
 * Create the combined store using slice pattern
 */
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Combine all slice states and actions
      ...createFileSlice(set as any, get as any),
      ...createTabSlice(set as any, get as any),
      ...createEditorSlice(set as any, get as any),
      ...createUISlice(set as any, get as any),
    }),
    {
      name: 'markdown-press-settings',
      partialize: (state) => ({ settings: sanitizeSettingsForPersistence((state as any).settings) }),
      merge: (persistedState, currentState) => {
        const persistedSettings = stripSensitiveSettings((persistedState as any)?.settings ?? {});
        const resolvedAISettings = resolvePersistedAISettings(persistedSettings);
        const legacyContentFontFamily = resolveFirstValidString(
          persistedSettings, ['chineseFontFamily', 'englishFontFamily', 'fontFamily'],
        ) || DEFAULT_EDITOR_FONT_FAMILY;
        const legacyContentFontSize = clampPersistedNumber(persistedSettings.fontSize, 12, 32, 16);
        const resolvedSharedFontSize = resolveFirstValidNumber(
          persistedSettings,
          ['fontSize', 'editorFontSize', 'previewFontSize', 'codeFontSize', 'editorCodeFontSize', 'previewCodeFontSize'],
          11, 32, legacyContentFontSize,
        );
        const mergedSettings = {
          ...defaultSettings,
          ...persistedSettings,
          blogRepoUrl: resolvePersistedBlogRepoUrl(persistedSettings),
          blogSiteUrl: resolvePersistedBlogSiteUrl(persistedSettings),
          uiFontFamily: typeof persistedSettings.uiFontFamily === 'string' && persistedSettings.uiFontFamily.trim()
            ? normalizeStoredUiFontFamily(persistedSettings.uiFontFamily)
            : DEFAULT_UI_FONT_FAMILY,
          uiFontSize: typeof persistedSettings.uiFontSize === 'number' && Number.isFinite(persistedSettings.uiFontSize)
            ? Math.min(22, Math.max(12, persistedSettings.uiFontSize))
            : defaultSettings.uiFontSize,
          editorFontFamily: typeof persistedSettings.editorFontFamily === 'string' && persistedSettings.editorFontFamily.trim()
            ? normalizeStoredEditorFontFamily(persistedSettings.editorFontFamily)
            : normalizeStoredEditorFontFamily(legacyContentFontFamily),
          previewFontFamily: typeof persistedSettings.previewFontFamily === 'string' && persistedSettings.previewFontFamily.trim()
            ? normalizeStoredPreviewFontFamily(persistedSettings.previewFontFamily)
            : normalizeStoredPreviewFontFamily(legacyContentFontFamily || DEFAULT_PREVIEW_FONT_FAMILY),
          codeFontFamily: typeof persistedSettings.codeFontFamily === 'string' && persistedSettings.codeFontFamily.trim()
            ? normalizeStoredCodeFontFamily(persistedSettings.codeFontFamily)
            : DEFAULT_CODE_FONT_FAMILY,
          fontSize: resolvedSharedFontSize,
          ...resolvedAISettings,
          language: normalizeLanguage(persistedSettings.language ?? defaultSettings.language),
          themeMode: normalizeThemeMode(persistedSettings.themeMode ?? defaultSettings.themeMode),
          trashFolder: normalizeTrashFolder(persistedSettings.trashFolder ?? defaultSettings.trashFolder),
          metadataFields: normalizeMetadataFields(persistedSettings.metadataFields),
          shortcuts: resolvePersistedShortcuts(persistedSettings),
        };

        return {
          ...currentState,
          ...(persistedState as any),
          settings: mergedSettings
        };
      },
    }
  )
);

// Re-export default settings for convenience
export { defaultSettings };

// Helper hook for accessing specific slices (optional optimization)
export function useFileStore(): FileState & FileActions {
  return useAppStore((state) => ({
    ...initialFileState,
    files: state.files,
    currentFilePath: state.currentFilePath,
    rootFolderPath: state.rootFolderPath,
    setFiles: state.setFiles,
    setCurrentFilePath: state.setCurrentFilePath,
    setRootFolderPath: state.setRootFolderPath,
    updateFileContent: state.updateFileContent,
    addFile: state.addFile,
    removeFile: state.removeFile,
    updateFileName: state.updateFileName,
    toggleFileTrash: state.toggleFileTrash,
    deleteFileForever: state.deleteFileForever,
  }));
}

export function useTabStore(): TabState & TabActions {
  return useAppStore((state) => ({
    ...initialTabState,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    fileContents: state.fileContents,
    lastSavedContent: state.lastSavedContent,
    addTab: state.addTab,
    closeTab: state.closeTab,
    closeOtherTabs: state.closeOtherTabs,
    setActiveTab: state.setActiveTab,
    updateTabContent: state.updateTabContent,
    getActiveContent: state.getActiveContent,
    clearAllCache: state.clearAllCache,
    markAsSaved: state.markAsSaved,
    hasUnsavedChanges: state.hasUnsavedChanges,
  }));
}

export function useEditorStore(): EditorState & EditorActions {
  return useAppStore((state) => ({
    ...initialEditorState,
    viewMode: state.viewMode,
    fileHistories: state.fileHistories,
    setContent: state.setContent,
    setContentForFile: state.setContentForFile,
    setViewMode: state.setViewMode,
    undo: state.undo,
    redo: state.redo,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    clearHistory: state.clearHistory,
  }));
}

export function useUIStore(): UIState & UIActions {
  return useAppStore((state) => ({
    ...initialUIState,
    isSidebarOpen: state.isSidebarOpen,
    isSettingsOpen: state.isSettingsOpen,
    isLoading: state.isLoading,
    isSaving: state.isSaving,
    isAnalyzing: state.isAnalyzing,
    isPublishing: state.isPublishing,
    settings: state.settings,
    notification: state.notification,
    outlineHeadings: state.outlineHeadings,
    activeHeadingId: state.activeHeadingId,
    setSidebarOpen: state.setSidebarOpen,
    setSettingsOpen: state.setSettingsOpen,
    setLoading: state.setLoading,
    setSaving: state.setSaving,
    setAnalyzing: state.setAnalyzing,
    setPublishing: state.setPublishing,
    setSettings: state.setSettings,
    updateSettings: state.updateSettings,
    showNotification: state.showNotification,
    clearNotification: state.clearNotification,
    setOutlineHeadings: state.setOutlineHeadings,
    setActiveHeadingId: state.setActiveHeadingId,
  }));
}
