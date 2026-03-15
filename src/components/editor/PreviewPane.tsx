import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { parseFrontmatter } from '../../utils/frontmatter';
import { renderMarkdown, useMarkdownRenderer } from '../../utils/markdown';
import { renderMermaidDiagrams } from '../../utils/markdown-extensions';
import { hydrateCachedPreviewImageSources, warmPreviewImage } from '../../utils/previewImageCache';

interface PreviewPaneProps {
  highlighter?: any;
  onScroll?: (percentage: number) => void;
  scrollPercentage?: number;
}

// Lower threshold for smoother sync
const SCROLL_THRESHOLD = 5;

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  highlighter,
  onScroll,
  scrollPercentage
}) => {
  const { settings, currentFilePath } = useAppStore();
  const content = useAppStore(selectContent);
  const previewRef = useRef<HTMLDivElement>(null);
  useMarkdownRenderer(highlighter, settings.themeMode);

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
      const bodyHTML = hydrateCachedPreviewImageSources(renderMarkdown(body), currentFilePath || undefined);
      return { frontmatter, bodyHTML };
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return { frontmatter, bodyHTML: '<p>Error rendering markdown</p>' };
    }
  }, [content, currentFilePath]);

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
      ref={previewRef}
      onScroll={handleScroll}
      className="editor-pane-layout h-full overflow-y-auto transition-colors"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="editor-pane-backdrop min-h-full px-4 py-6 md:px-8 md:py-8">
        <div className="editor-pane-frame mx-auto w-full max-w-5xl">
        {parsedContent.frontmatter && (
          <div
            className="preview-pane-properties mx-auto mb-4 w-full max-w-4xl border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden glass animate-fade-in group/metadata"
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
          <div className="editor-pane-sheet preview-pane-sheet mx-auto w-full max-w-4xl">
            <article
              className="markdown-body preview-pane-document"
              style={{ fontFamily: settings.fontFamily, fontSize: `${settings.fontSize}px` }}
              dangerouslySetInnerHTML={{ __html: parsedContent.bodyHTML }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
