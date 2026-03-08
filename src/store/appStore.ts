import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createFileSlice, type FileState, type FileActions, initialFileState } from './fileStore';
import { createTabSlice, type TabState, type TabActions, initialTabState } from './tabStore';
import { createEditorSlice, type EditorState, type EditorActions, initialEditorState } from './editorStore';
import { createUISlice, type UIState, type UIActions, initialUIState, defaultSettings } from './uiStore';
import { ViewMode, type FileNode, type AppSettings, type Notification } from '../types';
import type { HeadingNode } from '../utils/outline';

// Re-export types from slice stores
export type { FileState, FileActions, TabState, TabActions, EditorState, EditorActions, UIState, UIActions };

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
    content: state.content,
    viewMode: state.viewMode,
    history: state.history,
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
