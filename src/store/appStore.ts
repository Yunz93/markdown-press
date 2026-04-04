import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createFileSlice, type FileState, type FileActions, initialFileState } from './fileStore';
import { createTabSlice, type TabState, type TabActions, initialTabState } from './tabStore';
import { createEditorSlice, type EditorState, type EditorActions, initialEditorState, selectContent } from './editorStore';
import { createUISlice, type UIState, type UIActions, initialUIState, defaultSettings, normalizeThemeMode } from './uiStore';
import { ViewMode, type FileNode, type AppSettings, type Notification } from '../types';
import type { HeadingNode } from '../utils/outline';
import {
  DEFAULT_CHINESE_FONT_FAMILY,
  DEFAULT_ENGLISH_FONT_FAMILY,
  isLegacyDefaultChineseFontFamily,
} from '../utils/fontSettings';
import { normalizeBlogRepoUrl, normalizeBlogSiteUrl } from '../utils/blogRepo';

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
      partialize: (state) => ({ settings: (state as any).settings }),
      merge: (persistedState, currentState) => {
        const persistedSettings = (persistedState as any)?.settings ?? {};
        const persistedChineseFontFamily = typeof persistedSettings.chineseFontFamily === 'string'
          ? persistedSettings.chineseFontFamily.trim()
          : '';
        const mergedSettings = {
          ...defaultSettings,
          ...persistedSettings,
          blogRepoUrl: resolvePersistedBlogRepoUrl(persistedSettings),
          blogSiteUrl: resolvePersistedBlogSiteUrl(persistedSettings),
          englishFontFamily: typeof persistedSettings.englishFontFamily === 'string' && persistedSettings.englishFontFamily.trim()
            ? persistedSettings.englishFontFamily
            : (typeof persistedSettings.fontFamily === 'string' && persistedSettings.fontFamily.trim()
              ? persistedSettings.fontFamily
              : DEFAULT_ENGLISH_FONT_FAMILY),
          chineseFontFamily: persistedChineseFontFamily && !isLegacyDefaultChineseFontFamily(persistedChineseFontFamily)
            ? persistedChineseFontFamily
            : DEFAULT_CHINESE_FONT_FAMILY,
          themeMode: normalizeThemeMode(persistedSettings.themeMode ?? defaultSettings.themeMode),
          shortcuts: {
            ...defaultSettings.shortcuts,
            ...(persistedSettings.shortcuts ?? {})
          }
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
