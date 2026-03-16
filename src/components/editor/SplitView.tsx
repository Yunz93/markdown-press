import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { ViewMode } from '../../types';
import { EditorPane } from './EditorPane';
import { PreviewPane } from './PreviewPane';
import { WritingStatsDisplay } from '../stats/WritingStatsDisplay';

interface SplitViewProps {
  highlighter?: any;
  onContentChange?: (content: string) => void;
  isOutlineOpen: boolean;
  canShowOutline: boolean;
  canShowOutlineToggle: boolean;
  contentDensity: 'comfortable' | 'compact';
  onToggleOutline: () => void;
}

export const SplitView: React.FC<SplitViewProps> = ({
  highlighter,
  onContentChange,
  isOutlineOpen,
  canShowOutline,
  canShowOutlineToggle,
  contentDensity,
  onToggleOutline
}) => {
  const MIN_SPLIT_PANE_WIDTH = 360;
  const { viewMode } = useAppStore();
  const activeTabId = useAppStore((state) => state.activeTabId);
  const [splitRatio, setSplitRatio] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [scrollPercentage, setScrollPercentage] = useState(0);
  const [activeSide, setActiveSide] = useState<'editor' | 'preview' | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollTimerRef = React.useRef<number | null>(null);

  const handleEditorScroll = useCallback((p: number) => {
    setActiveSide('editor');
    setScrollPercentage(p);
    // Clear existing timer
    if (scrollTimerRef.current) {
      window.clearTimeout(scrollTimerRef.current);
    }
    // Reset active side after scrolling stops
    scrollTimerRef.current = window.setTimeout(() => {
      setActiveSide(null);
      scrollTimerRef.current = null;
    }, 100); // Reduced to 100ms for faster response
  }, []);

  const handlePreviewScroll = useCallback((p: number) => {
    setActiveSide('preview');
    setScrollPercentage(p);
    // Clear existing timer
    if (scrollTimerRef.current) {
      window.clearTimeout(scrollTimerRef.current);
    }
    // Reset active side after scrolling stops
    scrollTimerRef.current = window.setTimeout(() => {
      setActiveSide(null);
      scrollTimerRef.current = null;
    }, 100); // Reduced to 100ms for faster response
  }, []);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const minRatio = rect.width > 0 ? (MIN_SPLIT_PANE_WIDTH / rect.width) * 100 : 20;
    const maxRatio = 100 - minRatio;
    const newRatio = ((e.clientX - rect.left) / rect.width) * 100;
    const clampedRatio = Math.max(Math.min(minRatio, 50), Math.min(Math.max(maxRatio, 50), Math.max(minRatio, Math.min(maxRatio, newRatio))));
    setSplitRatio(clampedRatio);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const minRatio = entry.contentRect.width > 0 ? (MIN_SPLIT_PANE_WIDTH / entry.contentRect.width) * 100 : 20;
      const maxRatio = 100 - minRatio;
      if (viewMode === ViewMode.SPLIT && minRatio < maxRatio) {
        setSplitRatio((prev) => Math.min(Math.max(prev, minRatio), maxRatio));
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [viewMode]);

  const showEditor = viewMode === ViewMode.EDITOR || viewMode === ViewMode.SPLIT;
  const showPreview = viewMode === ViewMode.PREVIEW || viewMode === ViewMode.SPLIT;

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative flex flex-row"
        style={{ pointerEvents: isResizing ? 'none' : 'auto' }}
      >
        {showEditor && (
          <div
            className="h-full min-w-0 flex flex-col relative"
            style={{
              width: viewMode === ViewMode.SPLIT ? `${splitRatio}%` : '100%',
              borderRight: viewMode === ViewMode.SPLIT ? '1px solid rgba(128,128,128,0.1)' : 'none',
            }}
          >
            <EditorPane
              highlighter={highlighter}
              density={contentDensity}
              onContentChange={onContentChange}
              onScroll={handleEditorScroll}
              scrollPercentage={activeSide === 'preview' ? scrollPercentage : undefined}
            />
          </div>
        )}

        {viewMode === ViewMode.SPLIT && (
          <>
            <div
              className="w-1 hover:bg-accent-DEFAULT/50 cursor-col-resize z-10 absolute h-full flex items-center justify-center"
              style={{ left: `${splitRatio}%`, transform: 'translateX(-50%)' }}
              onMouseDown={handleMouseDown}
            >
              <div className="h-8 w-1 rounded-full bg-gray-300 dark:bg-gray-600 opacity-0 hover:opacity-100 transition-opacity" />
            </div>
          </>
        )}

        {showPreview && (
          <div
            className="h-full min-w-0 overflow-hidden bg-gray-50/50 dark:bg-black/50 transition-colors"
            style={{
              width: viewMode === ViewMode.SPLIT ? `${100 - splitRatio}%` : '100%',
            }}
          >
            <PreviewPane
              highlighter={highlighter}
              density={contentDensity}
              onScroll={handlePreviewScroll}
              scrollPercentage={activeSide === 'editor' ? scrollPercentage : undefined}
            />
          </div>
        )}
      </div>

      {activeTabId && (
        <div className="shrink-0 border-t border-gray-200/50 dark:border-white/10 bg-white/70 dark:bg-gray-900/45 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 md:px-5">
            <WritingStatsDisplay className="min-w-0 flex-1 border-t-0 px-0 py-0" showBorder={false} />
            {canShowOutlineToggle && viewMode !== ViewMode.SPLIT && (
              <div className="ml-auto shrink-0">
                <button
                  onClick={onToggleOutline}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200/80 dark:border-white/10 bg-white/45 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-white/10 transition-colors"
                  title="Toggle Outline (Ctrl+O)"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <circle cx="4" cy="6" r="2" fill="currentColor" />
                    <circle cx="4" cy="12" r="2" fill="currentColor" />
                    <circle cx="4" cy="18" r="2" fill="currentColor" />
                  </svg>
                  <span className="hidden sm:inline">{isOutlineOpen ? 'Hide Outline' : 'Show Outline'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
