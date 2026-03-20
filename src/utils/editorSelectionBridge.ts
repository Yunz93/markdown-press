import type { EditorView } from '@codemirror/view';

let activeEditorView: EditorView | null = null;

interface FocusOptions {
  alignTopRatio?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function registerActiveEditorView(view: EditorView | null): void {
  activeEditorView = view;
}

export function clearActiveEditorView(view: EditorView): void {
  if (activeEditorView === view) {
    activeEditorView = null;
  }
}

export function focusEditorRangeByOffset(
  start: number,
  end: number = start,
  options?: FocusOptions
): boolean {
  if (!activeEditorView) return false;

  const view = activeEditorView;
  const docLength = view.state.doc.length;
  const anchor = clamp(start, 0, docLength);
  const head = clamp(end, 0, docLength);

  view.focus();
  view.dispatch({
    selection: { anchor, head },
    scrollIntoView: true,
  });

  const alignTopRatio = clamp(options?.alignTopRatio ?? 0.3, 0, 1);
  const lineTop = view.lineBlockAt(anchor).top;
  const targetScrollTop = Math.max(0, lineTop - view.scrollDOM.clientHeight * alignTopRatio);
  view.scrollDOM.scrollTop = targetScrollTop;

  return true;
}
