import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { parseFrontmatter } from '../../utils/frontmatter';
import { renderMarkdown, useMarkdownRenderer } from '../../utils/markdown';
import { renderMermaidDiagrams } from '../../utils/markdown-extensions';
import { useWritingStats } from '../../hooks/useWritingStats';

interface PreviewPaneProps {
  highlighter?: any;
  onScroll?: (percentage: number) => void;
  scrollPercentage?: number;
  isOutlineOpen: boolean;
  onToggleOutline: () => void;
}

// Lower threshold for smoother sync
const SCROLL_THRESHOLD = 5;

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  highlighter,
  onScroll,
  scrollPercentage,
  isOutlineOpen,
  onToggleOutline
}) => {
  const { settings, activeTabId } = useAppStore();
  const content = useAppStore(selectContent);
  const previewRef = useRef<HTMLDivElement>(null);
  useMarkdownRenderer(highlighter, settings.themeMode);
  const stats = useWritingStats();

  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);

  // Sync scroll from other side
  useEffect(() => {
    if (scrollPercentage !== undefined && previewRef.current && !isSyncingScroll.current) {
      const el = previewRef.current;
      const scrollHeight = el.scrollHeight - el.clientHeight;

      if (scrollHeight <= 0) return;

      const targetScroll = scrollHeight * scrollPercentage;

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

  const handleScroll = useCallback(() => {
    if (!previewRef.current || !onScroll || isSyncingScroll.current) return;

    const el = previewRef.current;
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

  const parsedContent = useMemo(() => {
    if (!content) return { frontmatter: null, bodyHTML: '' };

    const { frontmatter, body } = parseFrontmatter(content);

    try {
      const bodyHTML = renderMarkdown(body);
      return { frontmatter, bodyHTML };
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return { frontmatter, bodyHTML: '<p>Error rendering markdown</p>' };
    }
  }, [content]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      renderMermaidDiagrams(previewRef.current);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [parsedContent.bodyHTML, settings.themeMode]);

  return (
    <div
      ref={previewRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto bg-gray-50/50 dark:bg-black/50 transition-colors"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="mx-auto max-w-3xl p-8 pb-24">
        {parsedContent.frontmatter && (
          <div className="mb-8 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden glass animate-fade-in text-sm group/metadata">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 text-xs font-semibold uppercase tracking-wider text-gray-400 flex justify-between items-center">
              <span>Properties</span>
            </div>
            <div className="p-2 table w-full">
              {Object.entries(parsedContent.frontmatter).map(([key, value]) => (
                <div key={key} className="table-row hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <div className="table-cell py-1.5 px-2 w-32 text-gray-500 dark:text-gray-400 font-medium align-top">
                    {key}
                  </div>
                  <div className="table-cell py-1.5 px-2 text-gray-800 dark:text-gray-200 align-top">
                    <input
                      type="text"
                      value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                      readOnly
                      className="w-full bg-transparent border-none focus:ring-0 text-sm py-0.5"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <article
          className="markdown-body"
          style={{ fontFamily: settings.fontFamily, fontSize: `${settings.fontSize}px` }}
          dangerouslySetInnerHTML={{ __html: parsedContent.bodyHTML }}
        />
      </div>

      {/* Writing Stats Footer */}
      {activeTabId && (
        <div className="sticky bottom-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-t border-gray-200/50 dark:border-white/5 px-6 py-2">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <div className="stat-item flex items-center gap-1.5" title="Characters">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7V4h16v3M9 20h6M12 4v16" />
              </svg>
              <span>{stats.characters.toLocaleString()}</span>
            </div>
            <div className="stat-item flex items-center gap-1.5" title="Words">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19h16M4 15l4-11 4 11 4-11 4 11" />
              </svg>
              <span>{stats.words.toLocaleString()}</span>
            </div>
            <div className="stat-item flex items-center gap-1.5 hidden md:flex" title="Paragraphs">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
              <span>{stats.paragraphs.toLocaleString()}</span>
            </div>
            <div className="stat-item flex items-center gap-1.5 hidden lg:flex" title="Reading time">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{stats.readingTimeMinutes} min</span>
            </div>
          </div>
          <button
            onClick={onToggleOutline}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
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
            {isOutlineOpen ? 'Hide Outline' : 'Show Outline'}
          </button>
        </div>
        </div>
      )}
    </div>
  );
};
