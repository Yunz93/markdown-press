import { useCallback, useEffect } from "react";
import { useAppStore, selectContent } from "../store/appStore";
import {
  getActiveEditorView,
  redoInActiveEditor,
  undoInActiveEditor,
} from "../utils/editorSelectionBridge";

/**
 * Global undo/redo wiring.
 *
 * The editor's CodeMirror history is the single source of truth whenever an
 * editor view is mounted: Ctrl+Z pressed outside the editor (sidebar,
 * preview, toolbar) is routed to CodeMirror so there is only one undo stack
 * per document. The store-level history is a fallback for content changes
 * made while no editor exists (e.g. preview-only files or AI rewrites in
 * preview mode).
 */
export function useUndoRedo() {
  const { undo, redo, canUndo, canRedo, activeTabId, fileHistories } =
    useAppStore();

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      // Focus inside the editor: CodeMirror's own history keymap handles it.
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement?.closest(".cm-editor")) return;

      const isMod = e.ctrlKey || e.metaKey;

      if (!isMod || !activeTabId) return;

      // Undo: Ctrl+Z or Cmd+Z (not Shift+Z for redo)
      if (e.key === "z" && !e.shiftKey) {
        if (getActiveEditorView()) {
          e.preventDefault();
          undoInActiveEditor();
        } else if (canUndo()) {
          e.preventDefault();
          undo();
        }
      }
      // Redo: Ctrl+Shift+Z or Cmd+Shift+Z, or Ctrl+Y
      else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        if (getActiveEditorView()) {
          e.preventDefault();
          redoInActiveEditor();
        } else if (canRedo()) {
          e.preventDefault();
          redo();
        }
      }
    },
    [undo, redo, canUndo, canRedo, activeTabId],
  );

  // Set up global keyboard listener
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const history = activeTabId ? fileHistories[activeTabId] : undefined;

  return {
    canUndo: Boolean(history && history.past.length > 0),
    canRedo: Boolean(history && history.future.length > 0),
    undo,
    redo,
  };
}

/**
 * Hook for tracking content history stats per file
 */
export function useHistoryStats() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const fileHistories = useAppStore((state) => state.fileHistories);
  const content = useAppStore(selectContent);

  const history = activeTabId ? fileHistories[activeTabId] : undefined;

  return {
    pastLength: history?.past.length ?? 0,
    futureLength: history?.future.length ?? 0,
    maxHistory: history?.maxHistory ?? 100,
    currentContentLength: content.length,
  };
}
