import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';

interface EditorPaneProps {
  placeholder?: string;
  onContentChange?: (content: string) => void;
  onScroll?: (percentage: number) => void;
  scrollPercentage?: number;
}

// Lower threshold for smoother sync
const SCROLL_THRESHOLD = 5;

export const EditorPane: React.FC<EditorPaneProps> = ({
  placeholder = 'Type here...',
  onContentChange,
  onScroll,
  scrollPercentage
}) => {
  const {
    content,
    setContent,
    settings,
    isSaving,
    activeTabId,
    undo,
    redo,
    canUndo,
    canRedo
  } = useAppStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);

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

          // Reset syncing flag after a short delay
          requestAnimationFrame(() => {
            isSyncingScroll.current = false;
          });
        });
      }
    }
  }, [scrollPercentage]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    onContentChange?.(newContent);
  }, [setContent, onContentChange]);

  const handleScroll = useCallback(() => {
    if (!textareaRef.current || !onScroll || isSyncingScroll.current) return;

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
  }, [onScroll]);

  // Handle keyboard shortcuts for undo/redo
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const isMod = e.ctrlKey || e.metaKey;

    if (isMod) {
      // Undo: Ctrl+Z or Cmd+Z
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
      }
      // Redo: Ctrl+Shift+Z or Cmd+Shift+Z, or Ctrl+Y
      else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
      }
    }
  }, [undo, redo, canUndo, canRedo]);

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
    <div className="h-full flex flex-col relative">
      {isSaving && (
        <div className="absolute top-2 right-4 z-10 flex items-center gap-1 text-xs text-gray-400 animate-pulse">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Saving...
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className={`
          flex-1 w-full h-full p-8 resize-none focus:outline-none bg-transparent
          ${settings.wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}
        `}
        style={{
          lineHeight: '1.6',
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
        }}
      />
    </div>
  );
};
