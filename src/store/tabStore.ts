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
  set: (fn: (state: TabState & { content: string }) => Partial<TabState & { content: string }>) => void,
  get: () => TabState & TabActions & { content: string }
): TabState & TabActions {
  return {
    ...initialTabState,

    addTab: (fileId, content) => set((state) => {
      const existingTabs = state.openTabs;
      if (existingTabs.includes(fileId)) {
        // Already open, just activate
        const existingContent = state.fileContents[fileId];
        return {
          activeTabId: fileId,
          content: existingContent !== undefined ? existingContent : state.content,
        };
      }
      return {
        openTabs: [...existingTabs, fileId],
        activeTabId: fileId,
        content: content !== undefined ? content : state.content,
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
      let newContent = state.content;
      if (state.activeTabId === fileId) {
        if (newTabs.length > 0) {
          const newIndex = Math.min(tabIndex, newTabs.length - 1);
          newActiveTabId = newTabs[newIndex];
          newContent = newFileContents[newActiveTabId] || '';
        } else {
          newActiveTabId = null;
          newContent = '';
        }
      }

      return {
        openTabs: newTabs,
        activeTabId: newActiveTabId,
        fileContents: newFileContents,
        lastSavedContent: newLastSavedContent,
        content: newContent,
      };
    }),

    setActiveTab: (fileId) => set((state) => {
      const content = state.fileContents[fileId];
      return {
        activeTabId: fileId,
        content: content !== undefined ? content : '',
      };
    }),

    updateTabContent: (fileId, content) => set((state) => ({
      fileContents: { ...state.fileContents, [fileId]: content },
      content: state.activeTabId === fileId ? content : state.content,
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
