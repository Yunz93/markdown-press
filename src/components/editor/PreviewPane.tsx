import React, { useRef, useMemo, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { parseFrontmatter } from '../../utils/frontmatter';
import { renderMarkdown, useMarkdownRenderer } from '../../utils/markdown';
import { renderMermaidDiagrams } from '../../utils/markdown-extensions';
import { hydrateCachedPreviewImageSources, warmPreviewImage } from '../../utils/previewImageCache';
import { resolveWikiLinkFile } from '../../utils/wikiLinks';
import { useFileOperations } from '../../hooks/useFileOperations';
import { createAttachmentResolverContext, resolveAttachmentTarget } from '../../utils/attachmentResolver';
import { getPaneLayoutMetrics } from './paneLayout';
import { flushPendingPreviewHeadingScroll, registerPreviewPane, unregisterPreviewPane } from '../../utils/previewNavigationBridge';
import { createHeadingSlug, flattenHeadingNodes, parseHeadings, type HeadingNode } from '../../utils/outline';
import { getCompositeFontFamily } from '../../utils/fontSettings';

interface PreviewPaneProps {
  highlighter?: any;
  onScroll?: (percentage: number) => void;
  scrollPercentage?: number;
  density?: 'comfortable' | 'compact';
}

// Lower threshold for smoother sync
const SCROLL_THRESHOLD = 5;
const SCROLL_EMIT_THRESHOLD = 0.001;
const SYNC_SCROLL_EASING = 0.24;
const SYNC_SCROLL_STOP_PX = 0.8;
const HEADING_SCROLL_RETRY_DELAYS_MS = [48, 140];

interface HeadingScrollOptions {
  alignTopRatio?: number;
  behavior?: ScrollBehavior;
}

function isExternalLink(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href.trim());
}

function isImageAttachment(fileName: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(fileName);
}

function findHeadingDefinitionByReference(headings: HeadingNode[], rawReference: string): HeadingNode | null {
  const normalizedReference = rawReference.trim().replace(/^#+/, '').trim();
  if (!normalizedReference) return null;

  const headingCandidates = Array.from(new Set([
    normalizedReference,
    createHeadingSlug(normalizedReference),
  ]));

  return headings.find((heading) =>
    headingCandidates.includes(heading.id)
    || headingCandidates.includes(createHeadingSlug(heading.text))
    || headingCandidates.includes(heading.text.trim())
  ) ?? null;
}

function findHeadingElementByReference(container: HTMLElement | null, rawReference: string): HTMLElement | null {
  if (!container) return null;

  const normalizedReference = rawReference.trim().replace(/^#+/, '').trim();
  if (!normalizedReference) return null;

  const headingCandidates = Array.from(new Set([
    normalizedReference,
    createHeadingSlug(normalizedReference),
  ]));

  return Array.from(container.querySelectorAll<HTMLElement>('article.markdown-body [data-heading-id]')).find((element) => {
    const headingId = element.dataset.headingId ?? '';
    const headingSlug = element.dataset.headingSlug ?? '';
    const headingText = (element.dataset.headingText ?? '').trim();
    return headingCandidates.includes(headingId)
      || headingCandidates.includes(headingSlug)
      || headingCandidates.includes(headingText);
  }) ?? null;
}

function scrollContainerToHeading(container: HTMLElement, target: HTMLElement, options?: HeadingScrollOptions): void {
  const alignTopRatio = Math.min(Math.max(options?.alignTopRatio ?? 0.18, 0, 1), 1);
  const targetTop = container.scrollTop
    + target.getBoundingClientRect().top
    - container.getBoundingClientRect().top
    - container.clientHeight * alignTopRatio;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior: options?.behavior ?? 'smooth',
  });
}

export const PreviewPane: React.FC<PreviewPaneProps> = ({
  highlighter,
  onScroll,
  scrollPercentage,
  density = 'comfortable'
}) => {
  const { settings, currentFilePath, rootFolderPath, files, showNotification, activeTabId } = useAppStore();
  const content = useAppStore(selectContent);
  const fontFamily = useMemo(() => getCompositeFontFamily(settings), [settings.englishFontFamily, settings.chineseFontFamily]);
  const previewRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  useMarkdownRenderer(highlighter, settings.themeMode);
  const { handleFileSelect, handleRevealInExplorer } = useFileOperations();

  const isSyncingScroll = useRef(false);
  const lastScrollPercentage = useRef(0);
  const emitAnimationFrameRef = useRef<number | null>(null);
  const pendingEmittedPercentageRef = useRef<number | null>(null);
  const syncAnimationFrameRef = useRef<number | null>(null);
  const syncTargetScrollTopRef = useRef<number | null>(null);
  const headingScrollAnimationFrameRef = useRef<number | null>(null);
  const headingScrollTimeoutRefs = useRef<number[]>([]);
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

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;

    const updatePaneWidth = () => {
      const nextWidth = layout.getBoundingClientRect().width;
      if (nextWidth > 0) {
        setPaneWidth(nextWidth);
      }
    };

    updatePaneWidth();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setPaneWidth(entry.contentRect.width);
    });

    resizeObserver.observe(layout);
    return () => resizeObserver.disconnect();
  }, [activeTabId]);

  const cancelSyncedScroll = useCallback(() => {
    if (syncAnimationFrameRef.current !== null) {
      cancelAnimationFrame(syncAnimationFrameRef.current);
      syncAnimationFrameRef.current = null;
    }
    syncTargetScrollTopRef.current = null;
    isSyncingScroll.current = false;
  }, []);

  const clearHeadingScrollRetries = useCallback(() => {
    if (headingScrollAnimationFrameRef.current !== null) {
      cancelAnimationFrame(headingScrollAnimationFrameRef.current);
      headingScrollAnimationFrameRef.current = null;
    }

    for (const timeoutId of headingScrollTimeoutRefs.current) {
      window.clearTimeout(timeoutId);
    }
    headingScrollTimeoutRefs.current = [];
  }, []);

  const animateSyncedScroll = useCallback((element: HTMLElement, targetScrollTop: number) => {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const clampedTarget = Math.min(Math.max(targetScrollTop, 0), maxScrollTop);
    syncTargetScrollTopRef.current = clampedTarget;

    if (syncAnimationFrameRef.current !== null) return;

    isSyncingScroll.current = true;

    const step = () => {
      const currentElement = previewRef.current;
      if (!currentElement || currentElement !== element) {
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

      const delta = target - currentElement.scrollTop;
      if (Math.abs(delta) <= SYNC_SCROLL_STOP_PX) {
        currentElement.scrollTop = target;
        syncAnimationFrameRef.current = null;
        syncTargetScrollTopRef.current = null;
        isSyncingScroll.current = false;
        return;
      }

      currentElement.scrollTop += delta * SYNC_SCROLL_EASING;
      syncAnimationFrameRef.current = requestAnimationFrame(step);
    };

    syncAnimationFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return () => {
      if (emitAnimationFrameRef.current !== null) {
        cancelAnimationFrame(emitAnimationFrameRef.current);
        emitAnimationFrameRef.current = null;
      }
      pendingEmittedPercentageRef.current = null;
      cancelSyncedScroll();
      clearHeadingScrollRetries();
    };
  }, [cancelSyncedScroll, clearHeadingScrollRetries]);

  // Sync scroll from other side
  useEffect(() => {
    if (scrollPercentage !== undefined && previewRef.current) {
      const el = previewRef.current;
      const scrollHeight = el.scrollHeight - el.clientHeight;

      if (scrollHeight <= 0) return;

      const targetScroll = scrollHeight * scrollPercentage;

      // Only update if significantly different to avoid jitter
      if (Math.abs(el.scrollTop - targetScroll) > SCROLL_THRESHOLD) {
        animateSyncedScroll(el, targetScroll);
      }
    }
  }, [scrollPercentage, animateSyncedScroll]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;

    const handleUserScrollIntent = () => {
      cancelSyncedScroll();
    };

    element.addEventListener('wheel', handleUserScrollIntent, { passive: true });
    element.addEventListener('touchstart', handleUserScrollIntent, { passive: true });
    element.addEventListener('pointerdown', handleUserScrollIntent, { passive: true });

    return () => {
      element.removeEventListener('wheel', handleUserScrollIntent);
      element.removeEventListener('touchstart', handleUserScrollIntent);
      element.removeEventListener('pointerdown', handleUserScrollIntent);
    };
  }, [cancelSyncedScroll]);

  const handleScroll = useCallback(() => {
    if (!previewRef.current || !onScroll || isSyncingScroll.current) return;

    const el = previewRef.current;
    const scrollHeight = el.scrollHeight - el.clientHeight;

    if (scrollHeight <= 0) return;

    const percentage = el.scrollTop / scrollHeight;

    // Only emit if significantly different
    if (Math.abs(percentage - lastScrollPercentage.current) > SCROLL_EMIT_THRESHOLD) {
      lastScrollPercentage.current = percentage;
      pendingEmittedPercentageRef.current = percentage;

      if (emitAnimationFrameRef.current !== null) return;

      emitAnimationFrameRef.current = requestAnimationFrame(() => {
        emitAnimationFrameRef.current = null;
        const pendingPercentage = pendingEmittedPercentageRef.current;
        pendingEmittedPercentageRef.current = null;
        if (pendingPercentage === null) return;
        onScroll(pendingPercentage);
      });
    }
  }, [onScroll]);

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

  const flattenedHeadings = useMemo(() => flattenHeadingNodes(parseHeadings(content)), [content]);
  const attachmentResolverContext = useMemo(
    () => createAttachmentResolverContext(files, rootFolderPath, currentFilePath),
    [files, rootFolderPath, currentFilePath]
  );

  const scrollToHeadingWithRetry = useCallback((headingId: string, options?: HeadingScrollOptions): boolean => {
    clearHeadingScrollRetries();

    const attemptScroll = (rawReference?: string) => {
      const container = previewRef.current;
      if (!container) return false;

      const target = findHeadingElementByReference(container, headingId)
        || (rawReference ? findHeadingElementByReference(container, rawReference) : null);

      if (target) {
        scrollContainerToHeading(container, target, options);
        return true;
      }

      return false;
    };

    if (attemptScroll(headingId)) {
      return true;
    }

    headingScrollAnimationFrameRef.current = requestAnimationFrame(() => {
      headingScrollAnimationFrameRef.current = null;
      if (attemptScroll(headingId)) return;

      headingScrollTimeoutRefs.current = HEADING_SCROLL_RETRY_DELAYS_MS.map((delay) => window.setTimeout(() => {
        attemptScroll(headingId);
      }, delay));
    });

    return false;
  }, [clearHeadingScrollRetries]);

  const navigateToWikilink = useCallback(async (wikiTarget: string): Promise<boolean> => {
    const matchedHeading = findHeadingDefinitionByReference(flattenedHeadings, wikiTarget);
    if (matchedHeading) {
      scrollToHeadingWithRetry(matchedHeading.id, { behavior: 'smooth' });
      return true;
    }

    if (wikiTarget.trim().startsWith('#')) {
      const matchedElement = findHeadingElementByReference(previewRef.current, wikiTarget);
      if (!matchedElement) {
        showNotification(`Heading not found: ${wikiTarget}`, 'error');
        return true;
      }

      scrollToHeadingWithRetry(matchedElement.dataset.headingId ?? matchedElement.id, { behavior: 'smooth' });
      return true;
    }

    const matchedFile = resolveWikiLinkFile(files, wikiTarget, rootFolderPath, currentFilePath);
    if (!matchedFile) {
      showNotification(`Linked file not found: ${wikiTarget}`, 'error');
      return true;
    }

    await handleFileSelect(matchedFile);
    return true;
  }, [flattenedHeadings, files, rootFolderPath, currentFilePath, handleFileSelect, scrollToHeadingWithRetry, showNotification]);

  const navigateToHashLink = useCallback((normalizedHash: string): boolean => {
    const matchedHeading = findHeadingDefinitionByReference(flattenedHeadings, normalizedHash);
    if (matchedHeading) {
      return scrollToHeadingWithRetry(matchedHeading.id, { behavior: 'smooth' }) || true;
    }

    if (normalizedHash.trim().startsWith('#')) {
      const fallbackHeading = findHeadingDefinitionByReference(flattenedHeadings, normalizedHash.trim().slice(1));
      if (fallbackHeading) {
        return scrollToHeadingWithRetry(fallbackHeading.id, { behavior: 'smooth' }) || true;
      }
    }

    const matchedElement = findHeadingElementByReference(previewRef.current, normalizedHash);
    if (!matchedElement && normalizedHash.trim().startsWith('#')) {
      const fallbackElement = findHeadingElementByReference(previewRef.current, normalizedHash.trim().slice(1));
      if (!fallbackElement) return false;

      return scrollToHeadingWithRetry(fallbackElement.dataset.headingId ?? fallbackElement.id, { behavior: 'smooth' }) || true;
    }

    if (!matchedElement) return false;

    return scrollToHeadingWithRetry(matchedElement.dataset.headingId ?? matchedElement.id, { behavior: 'smooth' }) || true;
  }, [flattenedHeadings, scrollToHeadingWithRetry]);

  useLayoutEffect(() => {
    const container = previewRef.current;
    if (!container) return;

    const headingElements = Array.from(container.querySelectorAll<HTMLElement>('article.markdown-body h1, article.markdown-body h2, article.markdown-body h3, article.markdown-body h4, article.markdown-body h5, article.markdown-body h6'));

    headingElements.forEach((element, index) => {
      const heading = flattenedHeadings[index];
      if (!heading) {
        element.removeAttribute('data-heading-id');
        element.removeAttribute('data-heading-slug');
        element.removeAttribute('data-heading-text');
        return;
      }

      element.id = heading.id;
      element.dataset.headingId = heading.id;
      element.dataset.headingSlug = createHeadingSlug(heading.text);
      element.dataset.headingText = heading.text;
    });

    flushPendingPreviewHeadingScroll(activeTabId);
  }, [activeTabId, flattenedHeadings, parsedContent.bodyHTML]);

  const handlePreviewClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const embedLink = target?.closest('a[data-wiki-embed="true"], a.markdown-embed') as HTMLAnchorElement | null;
    if (embedLink) {
      event.preventDefault();
      return;
    }

    const wikilink = target?.closest('a[data-wikilink]') as HTMLAnchorElement | null;
    if (wikilink) {
      event.preventDefault();

      const wikiTarget = wikilink.getAttribute('data-wikilink');
      if (!wikiTarget) return;
      await navigateToWikilink(wikiTarget);
      return;
    }

    const externalLink = target?.closest('a[href]') as HTMLAnchorElement | null;
    const href = externalLink?.getAttribute('href')?.trim() ?? '';
    if (externalLink && href && !href.startsWith('#') && isExternalLink(href)) {
      event.preventDefault();

      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(href);
      } catch (error) {
        console.error('Failed to open external link:', href, error);
        showNotification('Failed to open link in browser', 'error');
      }
      return;
    }

    const anchorLink = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
    if (!anchorLink) return;

    const rawHash = anchorLink.getAttribute('href');
    if (!rawHash || rawHash === '#') return;

    const normalizedHash = decodeURIComponent(rawHash.slice(1)).trim();
    if (!normalizedHash) return;

    event.preventDefault();
    navigateToHashLink(normalizedHash);
  }, [navigateToWikilink, navigateToHashLink, showNotification]);

  const handlePreviewDoubleClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const embedLink = target?.closest('a[data-wiki-embed="true"], a.markdown-embed') as HTMLAnchorElement | null;
    const embedTarget = embedLink?.dataset.wikiTarget?.trim() || embedLink?.dataset.wikilink?.trim();
    if (embedTarget) {
      event.preventDefault();
      const resolvedAttachment = await resolveAttachmentTarget(attachmentResolverContext, embedTarget);
      if (!resolvedAttachment) return;
      if (!isImageAttachment(resolvedAttachment.name)) {
        await handleRevealInExplorer(resolvedAttachment.path);
      }
      return;
    }

    const wikilink = target?.closest('a[data-wikilink]') as HTMLAnchorElement | null;
    const wikiTarget = wikilink?.getAttribute('data-wikilink');
    if (wikiTarget) {
      event.preventDefault();
      await navigateToWikilink(wikiTarget);
      return;
    }

    const anchorLink = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
    const rawHash = anchorLink?.getAttribute('href');
    if (rawHash && rawHash !== '#') {
      event.preventDefault();
      navigateToHashLink(decodeURIComponent(rawHash.slice(1)).trim());
      return;
    }

    const attachment = target?.closest('[data-attachment-path]') as HTMLElement | null;
    const attachmentPath = attachment?.dataset.attachmentPath;
    if (!attachmentPath) return;

    event.preventDefault();
    await handleRevealInExplorer(attachmentPath);
  }, [attachmentResolverContext, handleRevealInExplorer, navigateToHashLink, navigateToWikilink]);

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
    const embeds = Array.from(container.querySelectorAll<HTMLElement>('article.markdown-body [data-wiki-embed="true"], article.markdown-body a.markdown-embed'));

    const enhanceEmbeds = async () => {
      for (const embed of embeds) {
        if (cancelled || !embed.isConnected) return;

        const target = embed.dataset.wikiTarget?.trim() || embed.dataset.wikilink?.trim();
        const label = embed.dataset.wikiLabel?.trim() || embed.textContent?.trim() || '';
        if (!target) continue;

        const file = await resolveAttachmentTarget(attachmentResolverContext, target);
        if (!file) {
          embed.className = 'preview-attachment-file preview-attachment-file-missing';
          embed.textContent = `Missing attachment: ${label || target}`;
          continue;
        }

        if (isImageAttachment(file.name)) {
          const image = document.createElement('img');
          image.className = 'preview-attachment-image';
          image.alt = label || file.name;
          image.setAttribute('data-original-src', file.path);
          image.setAttribute('src', file.path);

          embed.replaceWith(image);

          try {
            const warmedSrc = await warmPreviewImage(file.path, currentFilePath || undefined);
            if (!cancelled && image.isConnected) {
              image.src = warmedSrc;
            }
          } catch {
            // Fall back to the raw file path if warming fails.
          }
          continue;
        }

        const attachment = document.createElement('a');
        attachment.className = 'preview-attachment-file';
        attachment.setAttribute('href', '#');
        attachment.dataset.attachmentPath = file.path;
        attachment.dataset.attachmentName = file.name;
        attachment.title = `Double-click to reveal ${file.name}`;
        attachment.innerHTML = `<span class="preview-attachment-file-name">${label || file.name}</span><span class="preview-attachment-file-hint">Double-click to reveal in Finder</span>`;
        embed.replaceWith(attachment);
      }
    };

    void enhanceEmbeds();

    return () => {
      cancelled = true;
    };
  }, [attachmentResolverContext, currentFilePath, parsedContent.bodyHTML]);

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

  useLayoutEffect(() => {
    const container = previewRef.current;
    if (!container || !activeTabId) return;

    registerPreviewPane(activeTabId, container);
    flushPendingPreviewHeadingScroll(activeTabId);
    return () => unregisterPreviewPane(activeTabId, container);
  }, [activeTabId]);

  return (
    <div
      ref={(node) => {
        previewRef.current = node;
        layoutRef.current = node;
      }}
      onScroll={handleScroll}
      onClick={handlePreviewClick}
      onDoubleClick={handlePreviewDoubleClick}
      className={`editor-pane-layout preview-scroll-container h-full min-w-0 overflow-y-auto transition-colors ${hasActiveFile ? '' : 'preview-pane-empty-state'}`}
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
              style={{ fontFamily, fontSize: `${settings.fontSize}px` }}
              dangerouslySetInnerHTML={{ __html: parsedContent.bodyHTML }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
