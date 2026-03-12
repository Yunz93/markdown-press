/**
 * Tab store state interface
 */
export interface TabState {
  openTabs: string[]; // Array of file IDs in tab order
  activeTabId: string | null; // Currently active tab
  fileContents: Record<string, string>; // Cache of file contents by ID
  lastSavedContent: Record<string, string>; // Track last saved content per file
}

/**
 * Tab store actions interface
 */
export interface TabActions {
  addTab: (fileId: string, content?: string) => void;
  closeTab: (fileId: string) => void;
  setActiveTab: (fileId: string) => void;
  updateTabContent: (fileId: string, content: string) => void;
  getActiveContent: () => string | undefined;
  clearAllCache: () => void;
  markAsSaved: (fileId: string) => void;
  hasUnsavedChanges: (fileId: string) => boolean;
}

/**
 * Initial tab state
 */
export const initialTabState: TabState = {
  openTabs: [],
  activeTabId: null,
  fileContents: {},
  lastSavedContent: {},
};

/**
 * Create tab store slice
 */
export function createTabSlice(
  set: (fn: (state: TabState) => Partial<TabState>) => void,
  get: () => TabState & TabActions
): TabState & TabActions {
  return {
    ...initialTabState,

    addTab: (fileId, content) => set((state) => {
      const existingTabs = state.openTabs;
      if (existingTabs.includes(fileId)) {
        // Already open, just activate
        return { activeTabId: fileId };
      }
      return {
        openTabs: [...existingTabs, fileId],
        activeTabId: fileId,
        fileContents: content !== undefined
          ? { ...state.fileContents, [fileId]: content }
          : state.fileContents,
      };
    }),

    closeTab: (fileId) => set((state) => {
      const tabIndex = state.openTabs.indexOf(fileId);
      if (tabIndex === -1) return state;

      const newTabs = state.openTabs.filter((id) => id !== fileId);
      const newFileContents = { ...state.fileContents };
      const newLastSavedContent = { ...state.lastSavedContent };
      delete newFileContents[fileId];
      delete newLastSavedContent[fileId];

      // If closing the active tab, activate adjacent tab
      let newActiveTabId = state.activeTabId;
      if (state.activeTabId === fileId) {
        newActiveTabId = newTabs.length > 0
          ? newTabs[Math.min(tabIndex, newTabs.length - 1)]
          : null;
      }

      return {
        openTabs: newTabs,
        activeTabId: newActiveTabId,
        fileContents: newFileContents,
        lastSavedContent: newLastSavedContent,
      };
    }),

    setActiveTab: (fileId) => set(() => ({ activeTabId: fileId })),

    updateTabContent: (fileId, content) => set((state) => ({
      fileContents: { ...state.fileContents, [fileId]: content },
    })),

    getActiveContent: () => {
      const state = get();
      if (!state.activeTabId) return undefined;
      return state.fileContents[state.activeTabId];
    },

    clearAllCache: () => set(() => ({
      fileContents: {},
      lastSavedContent: {},
      openTabs: [],
      activeTabId: null,
      content: '',
    })),

    markAsSaved: (fileId) => set((state) => {
      const content = state.fileContents[fileId];
      if (content === undefined) return state;
      return {
        lastSavedContent: { ...state.lastSavedContent, [fileId]: content },
      };
    }),

    hasUnsavedChanges: (fileId) => {
      const state = get();
      const content = state.fileContents[fileId];
      const saved = state.lastSavedContent[fileId];
      if (content === undefined) return false;
      return content !== saved;
    },
  };
}
