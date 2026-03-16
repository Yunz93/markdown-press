import React, { useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { parseFrontmatter } from '../../utils/frontmatter';
import { renderMarkdown, useMarkdownRenderer } from '../../utils/markdown';
import { renderMermaidDiagrams } from '../../utils/markdown-extensions';
import { hydrateCachedPreviewImageSources, warmPreviewImage } from '../../utils/previewImageCache';
import { resolveWikiLinkFile } from '../../utils/wikiLinks';
import { useFileOperations } from '../../hooks/useFileOperations';
import { getPaneLayoutMetrics } from './paneLayout';

interface PreviewPaneProps {
  highlighter?: any;
  onScroll?: (percentage: number) => void;
  scrollPercentage?: number;
  density?: 'comfortable' | 'compact';
}

// Lower threshold for smoother sync
const SCROLL_THRESHOLD = 5;

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  highlighter,
  onScroll,
  scrollPercentage,
  density = 'comfortable'
}) => {
  const { settings, currentFilePath, rootFolderPath, files, showNotification, activeTabId } = useAppStore();
  const content = useAppStore(selectContent);
  const previewRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  useMarkdownRenderer(highlighter, settings.themeMode);
  const { handleFileSelect } = useFileOperations();

  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const isCompact = density === 'compact';
  const hasActiveFile = Boolean(activeTabId);
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

  const handlePreviewClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest('a[data-wikilink]') as HTMLAnchorElement | null;
    if (!link) return;

    event.preventDefault();

    const wikiTarget = link.getAttribute('data-wikilink');
    if (!wikiTarget) return;

    const matchedFile = resolveWikiLinkFile(files, wikiTarget, rootFolderPath, currentFilePath);
    if (!matchedFile) {
      showNotification(`Linked file not found: ${wikiTarget}`, 'error');
      return;
    }

    await handleFileSelect(matchedFile);
  }, [files, rootFolderPath, currentFilePath, handleFileSelect, showNotification]);

  const parsedContent = useMemo(() => {
    if (!content) return { frontmatter: null, bodyHTML: '' };

    const { frontmatter, body } = parseFrontmatter(content);

    try {
      const bodyHTML = hydrateCachedPreviewImageSources(
        renderMarkdown(body, {
          highlighter,
          themeMode: settings.themeMode,
        }),
        currentFilePath || undefined
      );
      return { frontmatter, bodyHTML };
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return { frontmatter, bodyHTML: '<p>Error rendering markdown</p>' };
    }
  }, [content, currentFilePath, highlighter, settings.themeMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      renderMermaidDiagrams(previewRef.current);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [parsedContent.bodyHTML, settings.themeMode]);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    let cancelled = false;
    const images = Array.from(container.querySelectorAll('article.markdown-body img'));

    void Promise.all(images.map(async (image) => {
      const originalSrc = image.getAttribute('data-original-src') || image.getAttribute('src');
      if (!originalSrc) return;

      const cachedSrc = await warmPreviewImage(originalSrc, currentFilePath || undefined);
      if (cancelled || !image.isConnected || !cachedSrc) return;

      if (image.getAttribute('data-original-src') !== originalSrc) {
        image.setAttribute('data-original-src', originalSrc);
      }

      if (image.getAttribute('src') !== cachedSrc) {
        image.setAttribute('src', cachedSrc);
        image.src = cachedSrc;
      }
    }));

    return () => {
      cancelled = true;
    };
  }, [parsedContent.bodyHTML, currentFilePath]);

  return (
    <div
      ref={(node) => {
        previewRef.current = node;
        layoutRef.current = node;
      }}
      onScroll={handleScroll}
      onClick={handlePreviewClick}
      className={`editor-pane-layout h-full min-w-0 overflow-y-auto transition-colors ${hasActiveFile ? '' : 'preview-pane-empty-state'}`}
      style={{ pointerEvents: 'auto', ...layoutStyle }}
    >
      <div className={`editor-pane-backdrop min-h-full ${hasActiveFile ? '' : 'h-full'}`}>
        <div className={`editor-pane-frame w-full ${hasActiveFile ? '' : 'h-full'}`}>
        {parsedContent.frontmatter && (
          <div
            className="preview-pane-properties editor-pane-width-constrained mx-auto mb-4 w-full border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden glass animate-fade-in group/metadata"
            style={{ fontSize: `${settings.fontSize * 0.7}px` }}
          >
            <div className="preview-pane-properties-header px-4 py-2 border-b border-gray-200 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 font-semibold uppercase tracking-wider text-gray-400 flex justify-between items-center">
              <span>Properties</span>
            </div>
            <div className="p-2 table w-full">
              {Object.entries(parsedContent.frontmatter).map(([key, value]) => (
                <div key={key} className="table-row hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <div className="preview-pane-properties-cell table-cell py-1.5 px-2 w-32 text-gray-500 dark:text-gray-400 font-medium align-top">
                    {key}
                  </div>
                  <div className="preview-pane-properties-cell table-cell py-1.5 px-2 text-gray-800 dark:text-gray-200 align-top">
                    <input
                      type="text"
                      value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                      readOnly
                      className="preview-pane-properties-input w-full bg-transparent border-none focus:ring-0 py-0.5"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          <div className={`editor-pane-sheet preview-pane-sheet w-full ${hasActiveFile ? '' : 'h-full min-h-0'}`}>
            <article
              className={`markdown-body preview-pane-document ${isCompact ? 'preview-pane-document-compact' : ''} ${hasActiveFile ? '' : 'h-full'}`}
              style={{ fontFamily: settings.fontFamily, fontSize: `${settings.fontSize}px` }}
              dangerouslySetInnerHTML={{ __html: parsedContent.bodyHTML }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
