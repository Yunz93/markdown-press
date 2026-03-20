import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { getPaneLayoutMetrics } from './paneLayout';
import { clearActiveEditorView, registerActiveEditorView } from '../../utils/editorSelectionBridge';
import { Compartment, EditorSelection, EditorState, type Extension, type StateCommand } from '@codemirror/state';
import { EditorView, drawSelection, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

interface EditorPaneProps {
  placeholder?: string;
  onContentChange?: (content: string) => void;
  onScroll?: (percentage: number) => void;
  scrollPercentage?: number;
  highlighter?: any;
  density?: 'comfortable' | 'compact';
}

const SCROLL_THRESHOLD = 5;
const SCROLL_EMIT_THRESHOLD = 0.001;
const SYNC_SCROLL_EASING = 0.24;
const SYNC_SCROLL_STOP_PX = 0.8;
const EDITOR_LINE_HEIGHT = 1.95;

const lightMarkdownStyle = HighlightStyle.define([
  { tag: [tags.heading, tags.strong, tags.emphasis], color: '#7c3aed' },
  { tag: [tags.link, tags.url], color: '#0f9aa8' },
  { tag: [tags.quote, tags.list, tags.separator, tags.punctuation], color: '#8b5cf6' },
  { tag: [tags.monospace, tags.literal], color: '#475569' },
  { tag: [tags.keyword, tags.bool], color: '#d97706' },
  { tag: tags.comment, color: '#94a3b8', fontStyle: 'italic' },
]);

const darkMarkdownStyle = HighlightStyle.define([
  { tag: [tags.heading, tags.strong, tags.emphasis], color: '#d8b4fe' },
  { tag: [tags.link, tags.url], color: '#67e8f9' },
  { tag: [tags.quote, tags.list, tags.separator, tags.punctuation], color: '#c084fc' },
  { tag: [tags.monospace, tags.literal], color: '#bfdbfe' },
  { tag: [tags.keyword, tags.bool], color: '#fbbf24' },
  { tag: tags.comment, color: '#94a3b8', fontStyle: 'italic' },
]);

const insertTwoSpaces: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: '  ' },
    range: EditorSelection.cursor(range.from + 2),
  }));

  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

function createEditorTheme(
  themeMode: 'light' | 'dark',
  fontFamily: string,
  fontSize: number
): Extension {
  const isDark = themeMode === 'dark';

  return EditorView.theme({
    '&': {
      height: '100%',
      width: '100%',
      background: 'transparent',
      fontFamily,
      fontSize: `${fontSize}px`,
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      overflow: 'auto',
      lineHeight: String(EDITOR_LINE_HEIGHT),
      width: '100%',
      scrollbarGutter: 'stable both-edges',
    },
    '.cm-content': {
      minHeight: 'calc(100vh - 12rem)',
      flexBasis: '100%',
      width: '100%',
      minWidth: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      padding: 'var(--pane-content-top) var(--pane-content-px) var(--pane-content-bottom) !important',
      letterSpacing: '0.01em',
      tabSize: '2',
      caretColor: isDark ? '#c084fc' : '#7c3aed',
    },
    '.cm-line': {
      padding: '0 !important',
    },
    '.cm-content, .cm-line': {
      color: isDark ? '#e5eef9' : '#1f2937',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-activeLine': {
      background: 'transparent',
    },
    '.cm-selectionBackground': {
      background: isDark ? 'rgba(192, 132, 252, 0.22)' : 'rgba(168, 85, 247, 0.18)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      background: isDark ? 'rgba(192, 132, 252, 0.22)' : 'rgba(168, 85, 247, 0.18)',
    },
    '.cm-cursor': {
      width: '2px',
      marginLeft: '-1px',
      borderLeft: 'none',
      backgroundColor: isDark ? '#c084fc' : '#7c3aed',
      borderRadius: '999px',
      opacity: '0.95',
    },
    '.cm-dropCursor': {
      borderLeftColor: isDark ? '#c084fc' : '#7c3aed',
      borderLeftWidth: '2px',
      marginLeft: '-1px',
    },
    '.cm-placeholder': {
      color: isDark ? 'rgba(148, 163, 184, 0.72)' : 'rgba(100, 116, 139, 0.72)',
    },
  }, { dark: isDark });
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  placeholder = 'Type here...',
  onContentChange,
  onScroll,
  scrollPercentage,
  highlighter,
  density = 'comfortable'
}) => {
  void highlighter;

  const content = useAppStore(selectContent);
  const { setContent, settings, isSaving, activeTabId } = useAppStore();

  const editorRootRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const onScrollRef = useRef(onScroll);
  const emitAnimationFrameRef = useRef<number | null>(null);
  const pendingEmittedPercentageRef = useRef<number | null>(null);
  const syncAnimationFrameRef = useRef<number | null>(null);
  const syncTargetScrollTopRef = useRef<number | null>(null);

  const themeCompartment = useRef(new Compartment()).current;
  const wrapCompartment = useRef(new Compartment()).current;
  const syntaxCompartment = useRef(new Compartment()).current;
  const placeholderCompartment = useRef(new Compartment()).current;

  const updateContent = useCallback((nextContent: string) => {
    if (onContentChange) {
      onContentChange(nextContent);
      return;
    }
    setContent(nextContent);
  }, [onContentChange, setContent]);
  const updateContentRef = useRef(updateContent);

  const emitScrollPercentage = useCallback((scrollContainer: HTMLElement) => {
    if (isSyncingScroll.current) return;

    const onScrollCallback = onScrollRef.current;
    if (!onScrollCallback) return;

    const scrollHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    if (scrollHeight <= 0) return;

    const percentage = scrollContainer.scrollTop / scrollHeight;
    if (Math.abs(percentage - lastScrollPercentage.current) <= SCROLL_EMIT_THRESHOLD) return;

    lastScrollPercentage.current = percentage;
    pendingEmittedPercentageRef.current = percentage;

    if (emitAnimationFrameRef.current !== null) return;

    emitAnimationFrameRef.current = requestAnimationFrame(() => {
      emitAnimationFrameRef.current = null;
      const pendingPercentage = pendingEmittedPercentageRef.current;
      pendingEmittedPercentageRef.current = null;
      if (pendingPercentage === null) return;
      onScrollCallback(pendingPercentage);
    });
  }, []);

  const cancelSyncedScroll = useCallback(() => {
    if (syncAnimationFrameRef.current !== null) {
      cancelAnimationFrame(syncAnimationFrameRef.current);
      syncAnimationFrameRef.current = null;
    }
    syncTargetScrollTopRef.current = null;
    isSyncingScroll.current = false;
  }, []);

  const animateSyncedScroll = useCallback((scrollDom: HTMLElement, targetScrollTop: number) => {
    const maxScrollTop = Math.max(0, scrollDom.scrollHeight - scrollDom.clientHeight);
    const clampedTarget = Math.min(Math.max(targetScrollTop, 0), maxScrollTop);
    syncTargetScrollTopRef.current = clampedTarget;

    if (syncAnimationFrameRef.current !== null) return;

    isSyncingScroll.current = true;

    const step = () => {
      const currentView = editorViewRef.current;
      if (!currentView || currentView.scrollDOM !== scrollDom) {
        syncAnimationFrameRef.current = null;
        syncTargetScrollTopRef.current = null;
        isSyncingScroll.current = false;
        return;
      }

      const target = syncTargetScrollTopRef.current;
      if (target === null) {
        syncAnimationFrameRef.current = null;
        isSyncingScroll.current = false;
        return;
      }

      const delta = target - scrollDom.scrollTop;
      if (Math.abs(delta) <= SYNC_SCROLL_STOP_PX) {
        scrollDom.scrollTop = target;
        syncAnimationFrameRef.current = null;
        syncTargetScrollTopRef.current = null;
        isSyncingScroll.current = false;
        return;
      }

      scrollDom.scrollTop += delta * SYNC_SCROLL_EASING;
      syncAnimationFrameRef.current = requestAnimationFrame(step);
    };

    syncAnimationFrameRef.current = requestAnimationFrame(step);
  }, []);

  const [paneWidth, setPaneWidth] = useState(0);
  const layoutMetrics = useMemo(() => getPaneLayoutMetrics(paneWidth, density), [paneWidth, density]);
  const layoutStyle = useMemo(() => ({
    '--pane-backdrop-px': `${layoutMetrics.backdropPaddingX}px`,
    '--pane-backdrop-py': `${layoutMetrics.backdropPaddingY}px`,
    '--pane-frame-max-width': `${layoutMetrics.frameMaxWidth}px`,
    '--pane-sheet-max-width': `${layoutMetrics.sheetMaxWidth}px`,
    '--pane-sheet-radius': `${layoutMetrics.sheetRadius}px`,
    '--pane-content-px': `${layoutMetrics.contentPaddingX}px`,
    '--pane-content-top': `${layoutMetrics.contentPaddingTop}px`,
    '--pane-content-bottom': `${layoutMetrics.contentPaddingBottom}px`,
  }) as React.CSSProperties, [layoutMetrics]);

  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);

  useEffect(() => {
    return () => {
      if (emitAnimationFrameRef.current !== null) {
        cancelAnimationFrame(emitAnimationFrameRef.current);
        emitAnimationFrameRef.current = null;
      }
      pendingEmittedPercentageRef.current = null;
      cancelSyncedScroll();
    };
  }, [cancelSyncedScroll]);

  useEffect(() => {
    updateContentRef.current = updateContent;
  }, [updateContent]);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPaneWidth(entry.contentRect.width);
    });

    resizeObserver.observe(layout);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!activeTabId) {
      const existingView = editorViewRef.current;
      if (existingView) {
        clearActiveEditorView(existingView);
        existingView.destroy();
        editorViewRef.current = null;
      }
      return;
    }

    const root = editorRootRef.current;
    if (!root || editorViewRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, { key: 'Tab', run: insertTwoSpaces }]),
          markdown(),
          drawSelection(),
          themeCompartment.of(createEditorTheme(settings.themeMode, settings.fontFamily, settings.fontSize)),
          wrapCompartment.of(settings.wordWrap ? EditorView.lineWrapping : []),
          syntaxCompartment.of(syntaxHighlighting(settings.themeMode === 'dark' ? darkMarkdownStyle : lightMarkdownStyle)),
          placeholderCompartment.of(cmPlaceholder(placeholder)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              updateContentRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: root,
    });

    const handleDomScroll = () => {
      emitScrollPercentage(view.scrollDOM);
    };
    const handleUserScrollIntent = () => {
      cancelSyncedScroll();
    };

    view.scrollDOM.addEventListener('scroll', handleDomScroll, { passive: true });
    view.scrollDOM.addEventListener('wheel', handleUserScrollIntent, { passive: true });
    view.scrollDOM.addEventListener('touchstart', handleUserScrollIntent, { passive: true });
    view.scrollDOM.addEventListener('pointerdown', handleUserScrollIntent, { passive: true });

    editorViewRef.current = view;
    registerActiveEditorView(view);

    return () => {
      cancelSyncedScroll();
      view.scrollDOM.removeEventListener('scroll', handleDomScroll);
      view.scrollDOM.removeEventListener('wheel', handleUserScrollIntent);
      view.scrollDOM.removeEventListener('touchstart', handleUserScrollIntent);
      view.scrollDOM.removeEventListener('pointerdown', handleUserScrollIntent);
      clearActiveEditorView(view);
      view.destroy();
      if (editorViewRef.current === view) {
        editorViewRef.current = null;
      }
    };
  }, [
    activeTabId,
    placeholder,
    settings.fontFamily,
    settings.fontSize,
    settings.themeMode,
    settings.wordWrap,
    placeholderCompartment,
    syntaxCompartment,
    themeCompartment,
    wrapCompartment,
    emitScrollPercentage,
    cancelSyncedScroll,
  ]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartment.reconfigure(createEditorTheme(settings.themeMode, settings.fontFamily, settings.fontSize)),
    });
  }, [settings.themeMode, settings.fontFamily, settings.fontSize, themeCompartment]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    view.dispatch({
      effects: wrapCompartment.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
    });
  }, [settings.wordWrap, wrapCompartment]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    view.dispatch({
      effects: syntaxCompartment.reconfigure(
        syntaxHighlighting(settings.themeMode === 'dark' ? darkMarkdownStyle : lightMarkdownStyle)
      ),
    });
  }, [settings.themeMode, syntaxCompartment]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    view.dispatch({
      effects: placeholderCompartment.reconfigure(cmPlaceholder(placeholder)),
    });
  }, [placeholder, placeholderCompartment]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent === content) return;

    const anchor = Math.min(view.state.selection.main.anchor, content.length);
    const head = Math.min(view.state.selection.main.head, content.length);

    view.dispatch({
      changes: { from: 0, to: currentContent.length, insert: content },
      selection: { anchor, head },
    });
  }, [content]);

  useEffect(() => {
    if (scrollPercentage === undefined) return;

    const view = editorViewRef.current;
    if (!view) return;

    const scrollDom = view.scrollDOM;
    const maxScrollTop = scrollDom.scrollHeight - scrollDom.clientHeight;
    if (maxScrollTop <= 0) return;

    const targetScrollTop = maxScrollTop * scrollPercentage;
    if (Math.abs(scrollDom.scrollTop - targetScrollTop) <= SCROLL_THRESHOLD) return;
    animateSyncedScroll(scrollDom, targetScrollTop);
  }, [scrollPercentage, animateSyncedScroll]);

  if (!activeTabId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50/30 dark:bg-black/20 select-none">
        <svg className="w-16 h-16 mb-4 opacity-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p className="text-sm font-medium">Select a file to start editing</p>
      </div>
    );
  }

  return (
    <div
      ref={layoutRef}
      className="editor-pane-layout h-full min-w-0 flex flex-col relative"
      style={layoutStyle}
    >
      {isSaving && (
        <div className="absolute top-2 right-4 z-10 flex items-center gap-1 text-xs text-gray-400 animate-pulse">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Saving...
        </div>
      )}

      <div className="editor-pane-backdrop flex-1 min-h-0 overflow-hidden">
        <div className="editor-pane-scroll h-full overflow-hidden">
          <div className="editor-pane-frame h-full w-full">
            <div className="editor-pane-sheet h-full w-full">
              <div ref={editorRootRef} className="editor-pane-codemirror h-full w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
