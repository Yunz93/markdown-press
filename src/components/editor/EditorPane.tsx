import React, { useRef, useCallback, useEffect, useMemo, useDeferredValue } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { renderMarkdownSourceHighlight } from '../../utils/markdownSourceHighlight';

interface EditorPaneProps {
  placeholder?: string;
  onContentChange?: (content: string) => void;
  onScroll?: (percentage: number) => void;
  scrollPercentage?: number;
  highlighter?: any;
}

// Lower threshold for smoother sync
const SCROLL_THRESHOLD = 5;

export const EditorPane: React.FC<EditorPaneProps> = ({
  placeholder = 'Type here...',
  onContentChange,
  onScroll,
  scrollPercentage,
  highlighter
}) => {
  const content = useAppStore(selectContent);
  const {
    setContent,
    settings,
    isSaving,
    activeTabId
  } = useAppStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const deferredContent = useDeferredValue(content);

  const syncHighlightScroll = useCallback(() => {
    if (!textareaRef.current || !highlightRef.current) return;
    highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }, []);

  const highlightedContent = useMemo(() => (
    renderMarkdownSourceHighlight(deferredContent, settings.themeMode, highlighter)
  ), [deferredContent, settings.themeMode, highlighter]);

  // Sync scroll from other side
  useEffect(() => {
    if (scrollPercentage !== undefined && textareaRef.current && !isSyncingScroll.current) {
      const el = textareaRef.current;
      const targetScroll = (el.scrollHeight - el.clientHeight) * scrollPercentage;

      // Only update if significantly different to avoid jitter
      if (Math.abs(el.scrollTop - targetScroll) > SCROLL_THRESHOLD) {
        isSyncingScroll.current = true;

        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
          el.scrollTop = targetScroll;
          syncHighlightScroll();

          // Reset syncing flag after a short delay
          requestAnimationFrame(() => {
            isSyncingScroll.current = false;
          });
        });
      }
    }
  }, [scrollPercentage, syncHighlightScroll]);

  useEffect(() => {
    syncHighlightScroll();
  }, [highlightedContent, syncHighlightScroll]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    if (onContentChange) {
      onContentChange(newContent);
      return;
    }
    setContent(newContent);
  }, [setContent, onContentChange]);

  const handleScroll = useCallback(() => {
    if (!textareaRef.current || isSyncingScroll.current) return;

    syncHighlightScroll();
    if (!onScroll) return;

    const el = textareaRef.current;
    const scrollHeight = el.scrollHeight - el.clientHeight;

    if (scrollHeight <= 0) return;

    const percentage = el.scrollTop / scrollHeight;

    // Only emit if significantly different
    if (Math.abs(percentage - lastScrollPercentage.current) > 0.001) {
      lastScrollPercentage.current = percentage;

      // Use requestAnimationFrame to batch scroll events
      requestAnimationFrame(() => {
        onScroll(percentage);
      });
    }
  }, [onScroll, syncHighlightScroll]);

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
    <div className="editor-pane-layout h-full flex flex-col relative">
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
        <div className="editor-pane-scroll h-full overflow-y-auto overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
          <div className="editor-pane-frame mx-auto w-full max-w-5xl">
            <div className="editor-pane-sheet mx-auto w-full max-w-4xl">
              <div
                ref={highlightRef}
                aria-hidden="true"
                className={`editor-pane-highlight-layer absolute inset-0 overflow-auto pointer-events-none ${
                  settings.wordWrap ? 'wrapped' : 'nowrap'
                }`}
              >
                <div
                  className="editor-pane-highlight"
                  style={{
                    lineHeight: '1.95',
                    fontSize: `${settings.fontSize}px`,
                    fontFamily: settings.fontFamily,
                  }}
                  dangerouslySetInnerHTML={{ __html: highlightedContent }}
                />
              </div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleChange}
                onScroll={handleScroll}
                placeholder={placeholder}
                spellCheck={false}
                className={`
                  editor-pane syntax-highlighted relative z-10 w-full h-full min-h-[calc(100vh-12rem)] resize-none border-0 bg-transparent focus:outline-none
                  ${settings.wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}
                `}
                style={{
                  lineHeight: '1.95',
                  fontSize: `${settings.fontSize}px`,
                  fontFamily: settings.fontFamily,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
