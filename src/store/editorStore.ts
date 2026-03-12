import { ViewMode } from '../types';

// History state for undo/redo
export interface HistoryState {
  past: string[];
  future: string[];
  maxHistory: number;
}

/**
 * Editor store state interface
 * Note: `content` is NOT stored here. It is derived from
 * `fileContents[activeTabId]` via the `selectContent` selector.
 */
export interface EditorState {
  viewMode: ViewMode;
  history: HistoryState;
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
  history: {
    past: [],
    future: [],
    maxHistory: 100,
  },
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
      const { activeTabId, fileContents, history } = state;
      if (!activeTabId) return {};

      const current = fileContents[activeTabId] ?? '';

      if (skipHistory) {
        return {
          fileContents: { ...fileContents, [activeTabId]: content },
        };
      }

      // Don't add to history if content is the same
      if (current === content) return {};

      const newPast = [...history.past, current];
      const trimmedPast = newPast.length > history.maxHistory
        ? newPast.slice(-history.maxHistory)
        : newPast;

      return {
        fileContents: { ...fileContents, [activeTabId]: content },
        history: {
          ...history,
          past: trimmedPast,
          future: [],
        },
      };
    }),

    setViewMode: (mode) => set(() => ({ viewMode: mode })),

    undo: () => set((state) => {
      const { activeTabId, fileContents, history } = state;
      if (!activeTabId) return {};
      const { past, future, maxHistory } = history;
      if (past.length === 0) return {};

      const current = fileContents[activeTabId] ?? '';
      const previous = past[past.length - 1];
      const newPast = past.slice(0, -1);

      return {
        fileContents: { ...fileContents, [activeTabId]: previous },
        history: {
          past: newPast,
          future: [current, ...future],
          maxHistory,
        },
      };
    }),

    redo: () => set((state) => {
      const { activeTabId, fileContents, history } = state;
      if (!activeTabId) return {};
      const { past, future, maxHistory } = history;
      if (future.length === 0) return {};

      const current = fileContents[activeTabId] ?? '';
      const next = future[0];
      const newFuture = future.slice(1);

      return {
        fileContents: { ...fileContents, [activeTabId]: next },
        history: {
          past: [...past, current],
          future: newFuture,
          maxHistory,
        },
      };
    }),

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,

    clearHistory: () => set((state) => ({
      history: { past: [], future: [], maxHistory: state.history.maxHistory },
    })),
  };
}
