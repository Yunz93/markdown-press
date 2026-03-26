import { ViewMode } from '../types';

// History state for undo/redo per file
export interface HistoryState {
  past: string[];
  future: string[];
  maxHistory: number;
}

/**
 * Editor store state interface
 * Note: `content` is NOT stored here. It is derived from
 * `fileContents[activeTabId]` via the `selectContent` selector.
 * 
 * History is now per-file (keyed by fileId) to prevent cross-tab contamination
 * when switching between tabs during editing.
 */
export interface EditorState {
  viewMode: ViewMode;
  fileHistories: Record<string, HistoryState>; // Per-file history
}

/**
 * Editor store actions interface
 */
export interface EditorActions {
  setContent: (content: string, skipHistory?: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
}

/**
 * Initial editor state
 */
export const initialEditorState: EditorState = {
  viewMode: ViewMode.SPLIT,
  fileHistories: {}, // Initialize as empty object, histories created per file
};

// Combined type needed by the slice to access fileContents + activeTabId
interface EditorSliceContext {
  activeTabId: string | null;
  fileContents: Record<string, string>;
  updateTabContent: (fileId: string, content: string) => void;
}

/**
 * Selector: derive current content from fileContents[activeTabId].
 * Use this instead of reading `state.content` directly.
 */
export function selectContent(state: EditorState & EditorSliceContext): string {
  return state.activeTabId ? (state.fileContents[state.activeTabId] ?? '') : '';
}

/**
 * Create editor store slice
 */
export function createEditorSlice(
  set: (fn: (state: EditorState & EditorSliceContext) => Partial<EditorState & EditorSliceContext>) => void,
  get: () => EditorState & EditorActions & EditorSliceContext
): EditorState & EditorActions {
  return {
    ...initialEditorState,

    setContent: (content, skipHistory = false) => set((state) => {
      const { activeTabId, fileContents } = state;
      if (!activeTabId) return {};

      const current = fileContents[activeTabId] ?? '';

      if (skipHistory) {
        return {
          fileContents: { ...fileContents, [activeTabId]: content },
        };
      }

      // Don't add to history if content is the same
      if (current === content) return {};

      // Get or create history for this file
      const existingHistory = state.fileHistories[activeTabId] || { past: [], future: [], maxHistory: 100 };
      const newPast = [...existingHistory.past, current];
      const trimmedPast = newPast.length > existingHistory.maxHistory
        ? newPast.slice(-existingHistory.maxHistory)
        : newPast;

      return {
        fileContents: { ...fileContents, [activeTabId]: content },
        fileHistories: {
          ...state.fileHistories,
          [activeTabId]: {
            ...existingHistory,
            past: trimmedPast,
            future: [],
          },
        },
      };
    }),

    setViewMode: (mode) => set(() => ({ viewMode: mode })),

    undo: () => set((state) => {
      const { activeTabId, fileContents, fileHistories } = state;
      if (!activeTabId) return {};
      
      const history = fileHistories[activeTabId];
      if (!history || history.past.length === 0) return {};
      
      const { past, future, maxHistory } = history;
      const current = fileContents[activeTabId] ?? '';
      const previous = past[past.length - 1];
      const newPast = past.slice(0, -1);

      return {
        fileContents: { ...fileContents, [activeTabId]: previous },
        fileHistories: {
          ...fileHistories,
          [activeTabId]: {
            past: newPast,
            future: [current, ...future],
            maxHistory,
          },
        },
      };
    }),

    redo: () => set((state) => {
      const { activeTabId, fileContents, fileHistories } = state;
      if (!activeTabId) return {};
      
      const history = fileHistories[activeTabId];
      if (!history || history.future.length === 0) return {};
      
      const { past, future, maxHistory } = history;
      const current = fileContents[activeTabId] ?? '';
      const next = future[0];
      const newFuture = future.slice(1);

      return {
        fileContents: { ...fileContents, [activeTabId]: next },
        fileHistories: {
          ...fileHistories,
          [activeTabId]: {
            past: [...past, current],
            future: newFuture,
            maxHistory,
          },
        },
      };
    }),

    canUndo: () => {
      const state = get();
      const history = state.fileHistories[state.activeTabId || ''];
      return Boolean(history && history.past.length > 0);
    },
    
    canRedo: () => {
      const state = get();
      const history = state.fileHistories[state.activeTabId || ''];
      return Boolean(history && history.future.length > 0);
    },

    clearHistory: () => set((state) => ({
      fileHistories: {}, // Clear all file histories
    })),
  };
}
