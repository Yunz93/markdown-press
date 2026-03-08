import type { AppSettings, Notification } from '../types';
import type { HeadingNode } from '../utils/outline';

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
  fontSize: 16,
  wordWrap: true,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Microsoft YaHei"',
  githubRepo: '',
  geminiApiKey: '',
  shortcuts: { save: 'Ctrl+S', toggleView: 'Ctrl+E', aiAnalyze: 'Ctrl+J' },
  themeMode: typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  customCss: '',
  metadataFields: [
    { key: 'category', defaultValue: '' },
    { key: 'tags', defaultValue: '[]' },
    { key: 'status', defaultValue: 'draft' },
    { key: 'is_publish', defaultValue: 'false' },
    { key: 'date created', defaultValue: '{now}' },
    { key: 'date modified', defaultValue: '{now}' },
  ],
  autoSaveInterval: 1000,
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

    setSettings: (settings) => set(() => ({ settings })),

    updateSettings: (updatesOrFn) => set((state) => ({
      settings: {
        ...state.settings,
        ...(typeof updatesOrFn === 'function' ? updatesOrFn(state) : updatesOrFn)
      }
    })),

    showNotification: (msg, type) => {
      set(() => ({ notification: { msg, type } }));
      setTimeout(() => set(() => ({ notification: null })), 3000);
    },

    clearNotification: () => set(() => ({ notification: null })),

    setOutlineHeadings: (headings) => set(() => ({ outlineHeadings: headings })),

    setActiveHeadingId: (id) => set(() => ({ activeHeadingId: id })),
  };
}
