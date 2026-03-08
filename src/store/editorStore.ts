import { ViewMode } from '../types';

// History state for undo/redo
export interface HistoryState {
  past: string[];
  future: string[];
  maxHistory: number;
}

/**
 * Editor store state interface
 */
export interface EditorState {
  content: string;
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
  content: '',
  viewMode: ViewMode.SPLIT,
  history: {
    past: [],
    future: [],
    maxHistory: 100,
  },
};

/**
 * Create editor store slice
 */
export function createEditorSlice(
  set: (fn: (state: EditorState) => Partial<EditorState>) => void,
  get: () => EditorState & EditorActions
): EditorState & EditorActions {
  return {
    ...initialEditorState,

    setContent: (content, skipHistory = false) => set((state) => {
      if (skipHistory) {
        return { content };
      }

      // Don't add to history if content is the same
      if (state.content === content) {
        return state;
      }

      const newPast = [...state.history.past, state.content];
      // Limit history size
      const trimmedPast = newPast.length > state.history.maxHistory
        ? newPast.slice(-state.history.maxHistory)
        : newPast;

      return {
        content,
        history: {
          ...state.history,
          past: trimmedPast,
          future: [], // Clear future on new content
        },
      };
    }),

    setViewMode: (mode) => set(() => ({ viewMode: mode })),

    undo: () => set((state) => {
      const { past, future, maxHistory } = state.history;
      if (past.length === 0) return state;

      const previous = past[past.length - 1];
      const newPast = past.slice(0, -1);

      return {
        content: previous,
        history: {
          past: newPast,
          future: [state.content, ...future],
          maxHistory,
        },
      };
    }),

    redo: () => set((state) => {
      const { past, future, maxHistory } = state.history;
      if (future.length === 0) return state;

      const next = future[0];
      const newFuture = future.slice(1);

      return {
        content: next,
        history: {
          past: [...past, state.content],
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
