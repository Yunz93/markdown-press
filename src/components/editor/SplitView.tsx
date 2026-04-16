import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { ViewMode } from '../../types';
import { EditorPane, type EditorPaneHandle } from './EditorPane';
import { PreviewPane, type PreviewPaneHandle } from './PreviewPane';
import { WritingStatsDisplay } from '../stats/WritingStatsDisplay';
import { throttle } from '../../utils/throttle';
import type { PaneDensity } from './paneLayout';
import { useI18n } from '../../hooks/useI18n';
import type { ShikiHighlighter } from '../../hooks/useShikiHighlighter';

const PANE_TRANSITION_MS = 200;
const PANE_TRANSITION = `width ${PANE_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
const DIVIDER_TRANSITION = `left ${PANE_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity 120ms ease, transform ${PANE_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;

interface SplitViewProps {
  highlighter?: ShikiHighlighter | null;
  onContentChange?: (content: string) => void;
  onGenerateWikiFromSelection?: (selection: { text: string; from: number; to: number }) => Promise<string | null>;
  isOutlineOpen: boolean;
  canShowOutline: boolean;
  canShowOutlineToggle: boolean;
  contentDensity: PaneDensity;
  onToggleOutline: () => void;
}

export const SplitView: React.FC<SplitViewProps> = ({
  highlighter,
  onContentChange,
  onGenerateWikiFromSelection,
  isOutlineOpen,
  canShowOutline,
  canShowOutlineToggle,
  contentDensity,
  onToggleOutline
}) => {
  const { t } = useI18n();
  const MIN_SPLIT_PANE_WIDTH = 360;
  const { viewMode } = useAppStore();
  const activeTabId = useAppStore((state) => state.activeTabId);
  const [splitRatio, setSplitRatio] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorPaneRef = useRef<EditorPaneHandle | null>(null);
  const previewPaneRef = useRef<PreviewPaneHandle | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement | null>(null);
  const previousViewModeRef = useRef(viewMode);
  const [visualMode, setVisualMode] = useState<ViewMode>(viewMode);
  const editorScrollPercentageRef = useRef(0);
  const previewScrollPercentageRef = useRef(0);
  const transitionResyncTimerRef = useRef<number | null>(null);
  const transitionCleanupRef = useRef<(() => void) | null>(null);
  const scrollPositionsRef = useRef<Record<string, {
    editor: number;
    preview: number;
    lastViewMode: ViewMode;
  }>>({});

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

    // Throttle resize updates to 16ms (60fps) for better performance
    const throttledSetSplitRatio = throttle((width: number) => {
      const minRatio = width > 0 ? (MIN_SPLIT_PANE_WIDTH / width) * 100 : 20;
      const maxRatio = 100 - minRatio;
      if (viewMode === ViewMode.SPLIT && minRatio < maxRatio) {
        setSplitRatio((prev) => Math.min(Math.max(prev, minRatio), maxRatio));
      }
    }, 16);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      throttledSetSplitRatio(entry.contentRect.width);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [viewMode]);

  const isSplitModeRef = useRef(viewMode === ViewMode.SPLIT);

  // Keep `visualMode` in lockstep with `viewMode` before paint so pane widths (and
  // `previewLayoutActive`) match the store on the same frame as preview layout effects.
  useLayoutEffect(() => {
    setVisualMode(viewMode);
  }, [viewMode]);

  // Keep ref in sync with current view mode
  useEffect(() => {
    isSplitModeRef.current = viewMode === ViewMode.SPLIT;
  }, [viewMode]);

  // Handle editor scroll - sync to preview in split mode
  // Using ref to avoid re-creating callback and reduce latency
  const handleEditorScroll = useCallback((percentage: number) => {
    editorScrollPercentageRef.current = percentage;
    if (viewMode !== ViewMode.PREVIEW) {
      previewScrollPercentageRef.current = percentage;
    }
    if (isSplitModeRef.current) {
      previewPaneRef.current?.syncScrollTo(percentage, { immediate: true });
    }
  }, [viewMode]);

  const handlePreviewScroll = useCallback((percentage: number) => {
    previewScrollPercentageRef.current = percentage;
  }, []);

  const cleanupTransition = useCallback(() => {
    if (transitionCleanupRef.current) {
      transitionCleanupRef.current();
      transitionCleanupRef.current = null;
    }
    if (transitionResyncTimerRef.current !== null) {
      window.clearTimeout(transitionResyncTimerRef.current);
      transitionResyncTimerRef.current = null;
    }
  }, []);

  const syncVisiblePanesToAnchor = useCallback((anchorPercentage: number) => {
    cleanupTransition();

    if (viewMode !== ViewMode.PREVIEW) {
      editorPaneRef.current?.syncScrollTo(anchorPercentage, { immediate: true });
    }

    if (viewMode !== ViewMode.EDITOR) {
      previewPaneRef.current?.syncScrollTo(anchorPercentage, { immediate: true });
    }

    const resyncAfterTransition = () => {
      transitionCleanupRef.current = null;
      if (viewMode !== ViewMode.PREVIEW) {
        editorPaneRef.current?.syncScrollTo(anchorPercentage, { immediate: true });
      }
      if (viewMode !== ViewMode.EDITOR) {
        previewPaneRef.current?.syncScrollTo(anchorPercentage, { immediate: true });
      }
    };

    const wrapper = editorWrapperRef.current;
    if (wrapper) {
      const onTransitionEnd = (e: TransitionEvent) => {
        if (e.propertyName !== 'width') return;
        wrapper.removeEventListener('transitionend', onTransitionEnd);
        if (transitionResyncTimerRef.current !== null) {
          window.clearTimeout(transitionResyncTimerRef.current);
          transitionResyncTimerRef.current = null;
        }
        resyncAfterTransition();
      };
      wrapper.addEventListener('transitionend', onTransitionEnd);
      transitionCleanupRef.current = () => wrapper.removeEventListener('transitionend', onTransitionEnd);
    }

    transitionResyncTimerRef.current = window.setTimeout(() => {
      transitionResyncTimerRef.current = null;
      cleanupTransition();
      resyncAfterTransition();
    }, PANE_TRANSITION_MS + 50);
  }, [viewMode, cleanupTransition]);

  const saveActiveTabScrollState = useCallback((tabId: string | null) => {
    if (!tabId) return;
    scrollPositionsRef.current[tabId] = {
      editor: editorScrollPercentageRef.current,
      preview: previewScrollPercentageRef.current,
      lastViewMode: viewMode,
    };
  }, [viewMode]);

  useEffect(() => {
    return () => {
      cleanupTransition();
      if (transitionResyncTimerRef.current !== null) {
        window.clearTimeout(transitionResyncTimerRef.current);
      }
      saveActiveTabScrollState(activeTabId);
    };
  }, [activeTabId, saveActiveTabScrollState, cleanupTransition]);

  useEffect(() => {
    if (!activeTabId) return;

    const savedState = scrollPositionsRef.current[activeTabId] ?? {
      editor: 0,
      preview: 0,
      lastViewMode: ViewMode.SPLIT,
    };
    const anchorPercentage = savedState.lastViewMode === ViewMode.PREVIEW
      ? savedState.preview
      : savedState.editor;

    editorScrollPercentageRef.current = anchorPercentage;
    previewScrollPercentageRef.current = anchorPercentage;

    const frameId = window.requestAnimationFrame(() => {
      syncVisiblePanesToAnchor(anchorPercentage);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeTabId, syncVisiblePanesToAnchor]);

  // Handle view mode changes — always anchor on the editor position
  useEffect(() => {
    const previousViewMode = previousViewModeRef.current;
    previousViewModeRef.current = viewMode;

    if (previousViewMode === viewMode) return;

    const anchorPercentage = editorScrollPercentageRef.current;

    previewScrollPercentageRef.current = anchorPercentage;
    syncVisiblePanesToAnchor(anchorPercentage);
  }, [syncVisiblePanesToAnchor, viewMode]);

  const isSplitView = visualMode === ViewMode.SPLIT;
  const editorWidth = visualMode === ViewMode.EDITOR ? 100 : visualMode === ViewMode.SPLIT ? splitRatio : 0;
  const previewWidth = visualMode === ViewMode.PREVIEW ? 100 : visualMode === ViewMode.SPLIT ? 100 - splitRatio : 0;
  const editorActive = editorWidth > 0;
  const previewActive = previewWidth > 0;
  const activePaneKey = activeTabId ?? 'no-active-tab';

  const editorPaneStyle: React.CSSProperties = {
    width: `${editorWidth}%`,
    opacity: editorActive ? 1 : 0,
    pointerEvents: editorActive ? 'auto' : 'none',
    transition: isResizing ? 'none' : `${PANE_TRANSITION}, opacity 120ms ease`,
    willChange: isResizing ? 'auto' : 'width, opacity',
  };

  const previewPaneStyle: React.CSSProperties = {
    width: `${previewWidth}%`,
    opacity: previewActive ? 1 : 0,
    pointerEvents: previewActive ? 'auto' : 'none',
    transition: isResizing ? 'none' : `${PANE_TRANSITION}, opacity 120ms ease`,
    willChange: isResizing ? 'auto' : 'width, opacity',
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[#f8fafc] dark:bg-black">
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative flex flex-row"
        style={{ pointerEvents: isResizing ? 'none' : 'auto' }}
      >
        <div
          ref={editorWrapperRef}
          aria-hidden={!editorActive}
          className="h-full min-w-0 overflow-hidden flex flex-col relative"
          style={editorPaneStyle}
        >
          <EditorPane
            key={`editor-${activePaneKey}`}
            ref={editorPaneRef}
            highlighter={highlighter}
            density={contentDensity}
            onContentChange={onContentChange}
            onScroll={handleEditorScroll}
            onGenerateWikiFromSelection={onGenerateWikiFromSelection}
          />
        </div>

        <div
          className="w-3 hover:bg-accent-DEFAULT/50 z-10 absolute h-full flex items-center justify-center"
          style={{
            left: `${editorWidth}%`,
            opacity: isSplitView ? 1 : 0,
            transform: `translateX(-50%) scaleY(${isSplitView ? 1 : 0.9})`,
            pointerEvents: isSplitView ? 'auto' : 'none',
            cursor: isSplitView ? 'col-resize' : 'default',
            transition: isResizing ? 'none' : DIVIDER_TRANSITION,
            willChange: isResizing ? 'auto' : 'left, opacity, transform',
          }}
          onMouseDown={isSplitView ? handleMouseDown : undefined}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200/70 dark:bg-white/[0.06]" />
          <div className="relative h-8 w-1 rounded-full bg-gray-300 dark:bg-gray-600 opacity-0 hover:opacity-100 transition-opacity" />
        </div>

        <div
          aria-hidden={!previewActive}
          className="h-full min-w-0 overflow-hidden transition-colors"
          style={previewPaneStyle}
        >
          <PreviewPane
            key={`preview-${activePaneKey}`}
            ref={previewPaneRef}
            highlighter={highlighter}
            density={contentDensity}
            onScroll={handlePreviewScroll}
            previewLayoutActive={previewActive}
          />
        </div>
      </div>

      {activeTabId && (
        <div className="shrink-0 border-t border-gray-200/50 bg-[#f8fafc] dark:border-white/5 dark:bg-black">
          <div className="mx-auto flex w-full max-w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 md:px-5">
            <WritingStatsDisplay className="min-w-0 flex-1 border-t-0 px-0 py-0" showBorder={false} />
            {canShowOutlineToggle && (
              <div className="ml-auto shrink-0">
                <button
                  onClick={onToggleOutline}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-gray-200/50 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-white/20 transition-colors"
                  title={t('split_toggleOutline')}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <circle cx="4" cy="6" r="2" fill="currentColor" />
                    <circle cx="4" cy="12" r="2" fill="currentColor" />
                    <circle cx="4" cy="18" r="2" fill="currentColor" />
                  </svg>
                  <span className="hidden sm:inline">{isOutlineOpen ? t('split_hideOutline') : t('split_showOutline')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
