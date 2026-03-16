import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { renderMarkdownSourceHighlight } from '../../utils/markdownSourceHighlight';
import { getSelectionOffsets, setSelectionOffsets } from '../../utils/contentEditableSelection';
import { getPaneLayoutMetrics } from './paneLayout';

interface EditorPaneProps {
  placeholder?: string;
  onContentChange?: (content: string) => void;
  onScroll?: (percentage: number) => void;
  scrollPercentage?: number;
  highlighter?: any;
  density?: 'comfortable' | 'compact';
}

const SCROLL_THRESHOLD = 5;
const EDITOR_LINE_HEIGHT = 1.95;

function applyTextEdit(content: string, start: number, end: number, insertedText: string): string {
  return `${content.slice(0, start)}${insertedText}${content.slice(end)}`;
}

function normalizeEditorText(value: string): string {
  return value.replace(/\u00a0/g, ' ');
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  placeholder = 'Type here...',
  onContentChange,
  onScroll,
  scrollPercentage,
  highlighter,
  density = 'comfortable'
}) => {
  const content = useAppStore(selectContent);
  const {
    setContent,
    settings,
    isSaving,
    activeTabId
  } = useAppStore();

  const editorRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  const isComposingRef = useRef(false);
  const isMeasuringCaretRef = useRef(false);
  const [caretState, setCaretState] = useState<{
    visible: boolean;
    top: number;
    left: number;
    height: number;
  }>({
    visible: false,
    top: 0,
    left: 0,
    height: settings.fontSize,
  });

  const updateContent = useCallback((nextContent: string) => {
    if (onContentChange) {
      onContentChange(nextContent);
      return;
    }
    setContent(nextContent);
  }, [onContentChange, setContent]);

  const highlightedContent = useMemo(() => (
    content ? renderMarkdownSourceHighlight(content, settings.themeMode, highlighter) : ''
  ), [content, settings.themeMode, highlighter]);
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

  const updateCaret = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = window.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      !selection.isCollapsed ||
      document.activeElement !== editor
    ) {
      setCaretState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer)) {
      setCaretState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const offsets = getSelectionOffsets(editor);
    if (!offsets || offsets.start !== offsets.end) {
      setCaretState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    marker.setAttribute('aria-hidden', 'true');
    marker.style.position = 'relative';
    marker.style.display = 'inline-block';
    marker.style.width = '0';
    marker.style.overflow = 'hidden';
    marker.style.pointerEvents = 'none';
    marker.style.lineHeight = 'inherit';

    const caretRange = range.cloneRange();
    isMeasuringCaretRef.current = true;
    caretRange.insertNode(marker);
    const rect = marker.getBoundingClientRect();
    marker.remove();
    setSelectionOffsets(editor, offsets.start, offsets.end, { focus: false });
    isMeasuringCaretRef.current = false;

    const fontSize = settings.fontSize;
    const caretHeight = Math.max(1, Math.round(fontSize * 1.02));
    const lineBoxHeight = rect.height || fontSize * EDITOR_LINE_HEIGHT;
    const top = rect.top + Math.max(0, (lineBoxHeight - caretHeight) / 2);
    const left = rect.left;

    setCaretState((prev) => {
      if (
        prev.visible &&
        Math.abs(prev.top - top) < 0.5 &&
        Math.abs(prev.left - left) < 0.5 &&
        Math.abs(prev.height - caretHeight) < 0.5
      ) {
        return prev;
      }

      return {
        visible: true,
        top,
        left,
        height: caretHeight,
      };
    });
  }, [settings.fontSize]);

  const syncExternalScroll = useCallback((targetPercentage: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    const targetScroll = (editor.scrollHeight - editor.clientHeight) * targetPercentage;
    if (Math.abs(editor.scrollTop - targetScroll) <= SCROLL_THRESHOLD) {
      return;
    }

    isSyncingScroll.current = true;
    requestAnimationFrame(() => {
      editor.scrollTop = targetScroll;
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    });
  }, []);

  useEffect(() => {
    if (scrollPercentage === undefined || isSyncingScroll.current) return;
    syncExternalScroll(scrollPercentage);
  }, [scrollPercentage, syncExternalScroll]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (editor.innerHTML !== highlightedContent) {
      editor.innerHTML = highlightedContent;
    }

    if (pendingSelectionRef.current) {
      const selection = pendingSelectionRef.current;
      setSelectionOffsets(editor, selection.start, selection.end, { focus: document.activeElement === editor });
      pendingSelectionRef.current = null;
    }

    requestAnimationFrame(() => {
      updateCaret();
    });
  }, [highlightedContent, updateCaret]);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (isMeasuringCaretRef.current) return;
      updateCaret();
    };

    const handleWindowResize = () => {
      updateCaret();
    };

    const handleWindowScroll = () => {
      updateCaret();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('scroll', handleWindowScroll, true);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('scroll', handleWindowScroll, true);
    };
  }, [updateCaret]);

  const applyManualEdit = useCallback((insertedText: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = getSelectionOffsets(editor);
    if (!selection) return;

    const nextContent = applyTextEdit(content, selection.start, selection.end, insertedText);
    const nextOffset = selection.start + insertedText.length;
    pendingSelectionRef.current = { start: nextOffset, end: nextOffset };
    updateContent(nextContent);
  }, [content, updateContent]);

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const editor = e.currentTarget;
    const selection = getSelectionOffsets(editor);
    if (selection) {
      pendingSelectionRef.current = selection;
    }

    if (isComposingRef.current) {
      return;
    }

    updateContent(normalizeEditorText(editor.textContent ?? ''));
    requestAnimationFrame(() => {
      updateCaret();
    });
  }, [updateContent, updateCaret]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLDivElement>) => {
    isComposingRef.current = false;
    const editor = e.currentTarget;
    const selection = getSelectionOffsets(editor);
    if (selection) {
      pendingSelectionRef.current = selection;
    }
    updateContent(normalizeEditorText(editor.textContent ?? ''));
    requestAnimationFrame(() => {
      updateCaret();
    });
  }, [updateContent, updateCaret]);

  const handleBeforeInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const nativeEvent = e.nativeEvent as InputEvent;
    if (nativeEvent.isComposing) return;

    if (nativeEvent.inputType === 'insertParagraph' || nativeEvent.inputType === 'insertLineBreak') {
      e.preventDefault();
      applyManualEdit('\n');
    }
  }, [applyManualEdit]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text/plain');
    applyManualEdit(pastedText);
  }, [applyManualEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      applyManualEdit('  ');
    }
  }, [applyManualEdit]);

  const handleScroll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || isSyncingScroll.current) return;

    updateCaret();

    if (!onScroll) return;

    const scrollHeight = editor.scrollHeight - editor.clientHeight;
    if (scrollHeight <= 0) return;

    const percentage = editor.scrollTop / scrollHeight;
    if (Math.abs(percentage - lastScrollPercentage.current) <= 0.001) {
      return;
    }

    lastScrollPercentage.current = percentage;
    requestAnimationFrame(() => {
      onScroll(percentage);
    });
  }, [onScroll, updateCaret]);

  const handleFocus = useCallback(() => {
    requestAnimationFrame(() => {
      updateCaret();
    });
  }, [updateCaret]);

  const handleBlur = useCallback(() => {
    setCaretState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

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
              {caretState.visible && (
                <div
                  aria-hidden="true"
                  className="editor-pane-custom-caret"
                  style={{
                    top: `${caretState.top}px`,
                    left: `${caretState.left}px`,
                    height: `${caretState.height}px`,
                    backgroundColor: settings.themeMode === 'dark' ? '#c084fc' : '#7c3aed',
                  }}
                />
              )}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                spellCheck={false}
                data-placeholder={placeholder}
                onInput={handleInput}
                onBeforeInput={handleBeforeInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={`editor-pane editor-pane-editable h-full min-h-[calc(100vh-12rem)] w-full border-0 bg-transparent focus:outline-none ${
                  settings.wordWrap ? 'wrapped' : 'nowrap'
                }`}
                style={{
                  lineHeight: String(EDITOR_LINE_HEIGHT),
                  fontSize: `${settings.fontSize}px`,
                  fontFamily: settings.fontFamily,
                  caretColor: 'transparent',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
