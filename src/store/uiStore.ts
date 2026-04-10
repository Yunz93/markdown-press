import type { AppSettings, Notification } from '../types';
import type { HeadingNode } from '../utils/outline';
import { DEFAULT_AI_SYSTEM_PROMPT } from '../services/aiPrompts';
import { DEFAULT_CHINESE_FONT_FAMILY, DEFAULT_ENGLISH_FONT_FAMILY } from '../utils/fontSettings';
import { DEFAULT_METADATA_FIELDS } from '../utils/metadataFields';

let notificationTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeThemeMode(themeMode: unknown): AppSettings['themeMode'] {
  return themeMode === 'dark' ? 'dark' : 'light';
}

function normalizeLanguage(language: unknown): AppSettings['language'] {
  return language === 'en' ? 'en' : 'zh-CN';
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
  language: 'zh-CN',
  aiProvider: 'gemini',
  fontSize: 15,
  wordWrap: true,
  formatMarkdownOnManualSave: false,
  englishFontFamily: DEFAULT_ENGLISH_FONT_FAMILY,
  chineseFontFamily: DEFAULT_CHINESE_FONT_FAMILY,
  resourceFolder: 'resources',
  attachmentPasteFormat: 'obsidian',
  orderedListMode: 'strict',
  blogRepoUrl: '',
  blogSiteUrl: '',
  blogGithubToken: '',
  geminiApiKey: '',
  geminiModel: 'gemini-2.0-flash-exp',
  codexApiBaseUrl: 'https://api.openai.com/v1',
  codexApiKey: '',
  codexModel: 'gpt-5.2-codex',
  aiSystemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
  shortcuts: {
    save: 'Ctrl+S',
    toggleView: 'Cmd+Shift+V',
    aiAnalyze: 'Ctrl+J',
    search: 'Cmd+Shift+F',
    sidebarSearch: 'Cmd+Shift+S',
    locateCurrentFile: 'Cmd+Shift+L',
    settings: 'Cmd+Shift+0',
    toggleOutline: 'Cmd+Shift+O',
    toggleSidebar: 'Cmd+Shift+B',
    toggleTheme: 'Cmd+Shift+T',
    newNote: 'Ctrl+N',
    newFolder: 'Ctrl+Shift+N',
    closeTab: 'Ctrl+W',
    openKnowledgeBase: 'Cmd+Shift+K',
    exportHtml: 'Cmd+Shift+H',
  },
  knowledgeBases: [],
  lastKnowledgeBasePath: '',
  lastOpenedFilePath: '',
  themeMode: 'dark',
  metadataFields: DEFAULT_METADATA_FIELDS,
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
        language: normalizeLanguage(settings.language),
        themeMode: normalizeThemeMode(settings.themeMode),
      }
    })),

    updateSettings: (updatesOrFn) => set((state) => {
      const updates = typeof updatesOrFn === 'function' ? updatesOrFn(state) : updatesOrFn;
      return {
        settings: {
          ...state.settings,
          ...updates,
          language: normalizeLanguage(updates.language ?? state.settings.language),
          themeMode: normalizeThemeMode(updates.themeMode ?? state.settings.themeMode),
        }
      };
    }),

    showNotification: (msg, type) => {
      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }

      set(() => ({ notification: { msg, type } }));
      notificationTimer = setTimeout(() => {
        notificationTimer = null;
        set(() => ({ notification: null }));
      }, 3000);
    },

    clearNotification: () => {
      if (notificationTimer) {
        clearTimeout(notificationTimer);
        notificationTimer = null;
      }

      set(() => ({ notification: null }));
    },

    setOutlineHeadings: (headings) => set(() => ({ outlineHeadings: headings })),

    setActiveHeadingId: (id) => set(() => ({ activeHeadingId: id })),
  };
}

export { normalizeLanguage, normalizeThemeMode };
