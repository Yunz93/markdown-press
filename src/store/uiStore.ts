import type { AppSettings, Notification } from '../types';
import type { HeadingNode } from '../utils/outline';
import { DEFAULT_CHINESE_FONT_FAMILY, DEFAULT_ENGLISH_FONT_FAMILY } from '../utils/fontSettings';

function normalizeThemeMode(themeMode: unknown): AppSettings['themeMode'] {
  return themeMode === 'dark' ? 'dark' : 'light';
}

/**
 * UI store state interface
 */
export interface UIState {
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isAnalyzing: boolean;
  isPublishing: boolean;
  settings: AppSettings;
  notification: Notification | null;
  outlineHeadings: HeadingNode[];
  activeHeadingId: string | null;
}

/**
 * UI store actions interface
 */
export interface UIActions {
  setSidebarOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setPublishing: (publishing: boolean) => void;
  setSettings: (settings: AppSettings) => void;
  updateSettings: (updates: Partial<AppSettings> | ((state: UIState) => Partial<AppSettings>)) => void;
  showNotification: (msg: string, type: 'success' | 'error') => void;
  clearNotification: () => void;
  setOutlineHeadings: (headings: HeadingNode[]) => void;
  setActiveHeadingId: (id: string | null) => void;
}

/**
 * Default settings
 */
export const defaultSettings: AppSettings = {
  fontSize: 15,
  wordWrap: true,
  englishFontFamily: DEFAULT_ENGLISH_FONT_FAMILY,
  chineseFontFamily: DEFAULT_CHINESE_FONT_FAMILY,
  resourceFolder: 'resources',
  attachmentPasteFormat: 'obsidian',
  githubRepo: '',
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash-exp',
  shortcuts: {
    save: 'Ctrl+S',
    toggleView: 'Ctrl+E',
    aiAnalyze: 'Ctrl+J',
    search: 'Ctrl+F',
    settings: 'Ctrl+,',
    toggleOutline: 'Ctrl+O',
    toggleSidebar: 'Ctrl+B',
    newNote: 'Ctrl+N',
    newFolder: 'Ctrl+Shift+N',
    closeTab: 'Ctrl+W',
    openKnowledgeBase: 'Ctrl+Shift+O',
    exportHtml: 'Ctrl+Shift+E',
  },
  knowledgeBases: [],
  lastKnowledgeBasePath: '',
  themeMode: 'dark',
  metadataFields: [
    { key: 'category', defaultValue: '' },
    { key: 'tags', defaultValue: '[]' },
    { key: 'status', defaultValue: 'draft' },
    { key: 'is_publish', defaultValue: 'false' },
    { key: 'date created', defaultValue: '{now}' },
    { key: 'date modified', defaultValue: '{now}' },
  ],
  autoSaveInterval: 60000,
};

/**
 * Initial UI state
 */
export const initialUIState: UIState = {
  isSidebarOpen: true,
  isSettingsOpen: false,
  isLoading: false,
  isSaving: false,
  isAnalyzing: false,
  isPublishing: false,
  settings: defaultSettings,
  notification: null,
  outlineHeadings: [],
  activeHeadingId: null,
};

/**
 * Create UI store slice
 */
export function createUISlice(
  set: (fn: (state: UIState) => Partial<UIState>) => void,
  get: () => UIState & UIActions
): UIState & UIActions {
  return {
    ...initialUIState,

    setSidebarOpen: (open) => set(() => ({ isSidebarOpen: open })),

    setSettingsOpen: (open) => set(() => ({ isSettingsOpen: open })),

    setLoading: (loading) => set(() => ({ isLoading: loading })),

    setSaving: (saving) => set(() => ({ isSaving: saving })),

    setAnalyzing: (analyzing) => set(() => ({ isAnalyzing: analyzing })),

    setPublishing: (publishing) => set(() => ({ isPublishing: publishing })),

    setSettings: (settings) => set(() => ({
      settings: {
        ...settings,
        themeMode: normalizeThemeMode(settings.themeMode),
      }
    })),

    updateSettings: (updatesOrFn) => set((state) => {
      const updates = typeof updatesOrFn === 'function' ? updatesOrFn(state) : updatesOrFn;
      return {
        settings: {
          ...state.settings,
          ...updates,
          themeMode: normalizeThemeMode(updates.themeMode ?? state.settings.themeMode),
        }
      };
    }),

    showNotification: (msg, type) => {
      set(() => ({ notification: { msg, type } }));
      setTimeout(() => set(() => ({ notification: null })), 3000);
    },

    clearNotification: () => set(() => ({ notification: null })),

    setOutlineHeadings: (headings) => set(() => ({ outlineHeadings: headings })),

    setActiveHeadingId: (id) => set(() => ({ activeHeadingId: id })),
  };
}

export { normalizeThemeMode };
