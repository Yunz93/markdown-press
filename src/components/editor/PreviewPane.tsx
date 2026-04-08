/**
 * PreviewPane - 简化重构版
 * 
 * 使用新提取的 hooks：
 * - usePreviewRenderer: Markdown/HTML 渲染
 * - usePreviewScroll: 滚动同步
 * - useWikiLinkNavigation: WikiLink 导航
 */

import React, { forwardRef, useRef, useMemo, useImperativeHandle, useLayoutEffect, useCallback, useState, useEffect } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { getPaneLayoutMetrics, type PaneDensity } from './paneLayout';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileSystem } from '../../hooks/useFileSystem';
import { getCompositeFontFamily } from '../../utils/fontSettings';
import { usePreviewRenderer, usePreviewScroll, useWikiLinkNavigation } from './hooks';
import { throttle } from '../../utils/throttle';
import { useThrottledResize, processInBatches } from '../../utils/performance';
import { resolvePreviewSource, warmPreviewImage } from '../../utils/previewImageCache';
import { resolveAttachmentTarget } from '../../utils/attachmentResolver';
import { createAttachmentResolverContext } from '../../utils/attachmentResolver';
import { renderMermaidDiagrams } from '../../utils/markdown-extensions';
import { createHeadingSlug, flattenHeadingNodes, parseHeadings } from '../../utils/outline';
import { parseFrontmatter } from '../../utils/frontmatter';
import { isWindowsPlatform } from '../../utils/platform';
import type { FileNode } from '../../types';
import { useI18n } from '../../hooks/useI18n';

interface PreviewPaneProps {
  highlighter?: any;
  onScroll?: (percentage: number) => void;
  density?: PaneDensity;
}

export interface PreviewPaneHandle {
  cancelScrollSync: () => void;
  syncScrollTo: (percentage: number) => void;
}

// Helper functions
function isExternalLink(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href.trim());
}

function isValidExternalUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isImageAttachment(fileName: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(fileName);
}

function isMarkdownNote(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}

function isPdfAttachment(fileName: string): boolean {
  return /\.pdf$/i.test(fileName);
}

function isHtmlDocument(fileName: string): boolean {
  return /\.html?$/i.test(fileName);
}

function getPreviewFileType(filePath: string | null | undefined): 'markdown' | 'image' | 'pdf' | 'html' | 'unsupported' {
  if (!filePath) return 'markdown';
  if (isImageAttachment(filePath)) return 'image';
  if (isPdfAttachment(filePath)) return 'pdf';
  if (isHtmlDocument(filePath)) return 'html';
  if (isMarkdownNote(filePath)) return 'markdown';
  return 'unsupported';
}

export const PreviewPane = forwardRef<PreviewPaneHandle, PreviewPaneProps>(({
  highlighter,
  onScroll,
  density = 'comfortable' as PaneDensity
}, ref) => {
  const { t } = useI18n();
  const { settings, currentFilePath, rootFolderPath, files, showNotification, activeTabId } = useAppStore();
  const content = useAppStore(selectContent);
  const fontFamily = useMemo(() => getCompositeFontFamily(settings), [settings.englishFontFamily, settings.chineseFontFamily]);
  const previewRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  
  const { handleFileSelect, handleRevealInExplorer } = useFileOperations();
  const { readFile } = useFileSystem();

  const isCompact = density === 'compact';
  const isWindows = useMemo(() => isWindowsPlatform(), []);
  const hasActiveFile = Boolean(activeTabId);
  const previewFileType = useMemo(() => getPreviewFileType(currentFilePath), [currentFilePath]);
  const isMarkdownPreview = previewFileType === 'markdown';
  const isHtmlPreview = previewFileType === 'html';
  const flattenedHeadings = useMemo(() => (
    isMarkdownPreview ? flattenHeadingNodes(parseHeadings(content)) : []
  ), [content, isMarkdownPreview]);

  // Pane layout state - use ref to avoid re-render
  const [layoutMetrics, setLayoutMetrics] = useState(() => getPaneLayoutMetrics(0, density));
  const metricsRef = useRef(layoutMetrics);

  // Optimized resize handling
  const observeResize = useThrottledResize((width) => {
    const newMetrics = getPaneLayoutMetrics(width, density);
    metricsRef.current = newMetrics;
    setLayoutMetrics(newMetrics);
  }, 100);

  // Pane layout style - memoized with stable deps
  const layoutStyle = useMemo(() => ({
    '--pane-backdrop-px': `${layoutMetrics.backdropPaddingX}px`,
    '--pane-backdrop-py': `${layoutMetrics.backdropPaddingY}px`,
    '--pane-frame-max-width': `${layoutMetrics.frameMaxWidth}px`,
    '--pane-sheet-max-width': `${layoutMetrics.sheetMaxWidth}px`,
    '--pane-sheet-radius': `${layoutMetrics.sheetRadius}px`,
    '--pane-content-px': `${layoutMetrics.contentPaddingX}px`,
    '--pane-content-top': `${layoutMetrics.contentPaddingTop}px`,
    '--pane-content-bottom': `${layoutMetrics.contentPaddingBottom}px`,
    '--editor-font-family': fontFamily,
    '--editor-font-size': `${settings.fontSize}px`,
  }) as React.CSSProperties, [layoutMetrics, fontFamily, settings.fontSize]);

  // Optimized pane resize tracking
  useLayoutEffect(() => {
    observeResize(layoutRef.current);
  }, [observeResize]);

  // Preview renderer hook
  const renderer = usePreviewRenderer({
    content,
    currentFilePath,
    isMarkdownPreview,
    isHtmlPreview,
    highlighter,
    themeMode: settings.themeMode as 'light' | 'dark',
    files,
    rootFolderPath,
    fileContents: {},
    activeTabId,
    readFile,
  });

  // Scroll sync hook
  const scroll = usePreviewScroll({ onScroll });

  // WikiLink navigation hook
  const navigation = useWikiLinkNavigation({
    content,
    currentFilePath,
    rootFolderPath,
    files,
    activeTabId,
    isMarkdownPreview,
    showNotification,
    handleFileSelect,
  });

  // Register/unregister preview pane
  useEffect(() => {
    const container = previewRef.current;
    if (!container || !activeTabId) return;

    navigation.registerPane(container);
    return () => navigation.unregisterPane(container);
  }, [activeTabId, navigation]);

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    cancelScrollSync: scroll.cancelScrollSync,
    syncScrollTo: (percentage: number) => {
      const element = previewRef.current;
      if (!element) return;
      scroll.syncScrollTo(element, percentage);
    },
  }), [scroll]);

  // Handle scroll events
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    scroll.handleScroll(event.currentTarget);
  }, [scroll]);

  // Cancel sync on user scroll intent
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;

    const handleUserScroll = () => scroll.cancelScrollSync();

    element.addEventListener('wheel', handleUserScroll, { passive: true });
    element.addEventListener('touchstart', handleUserScroll, { passive: true });
    element.addEventListener('pointerdown', handleUserScroll, { passive: true });

    return () => {
      element.removeEventListener('wheel', handleUserScroll);
      element.removeEventListener('touchstart', handleUserScroll);
      element.removeEventListener('pointerdown', handleUserScroll);
    };
  }, [scroll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      scroll.cancelScrollSync();
      navigation.clearScrollRetries();
    };
  }, [scroll, navigation]);

  // Apply heading attributes after render - use requestIdleCallback for better performance
  useEffect(() => {
    if (!isMarkdownPreview) return;
    const container = previewRef.current;
    if (!container) return;

    const applyHeadingAttributes = () => {
      const headingElements = Array.from(container.querySelectorAll<HTMLElement>(
        'article.markdown-body h1, article.markdown-body h2, article.markdown-body h3, article.markdown-body h4, article.markdown-body h5, article.markdown-body h6'
      ));

      headingElements.forEach((element: HTMLElement, index) => {
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
    };

    // Use requestIdleCallback for non-critical updates
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(applyHeadingAttributes, { timeout: 100 });
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(applyHeadingAttributes, 0);
        return () => clearTimeout(id);
    }
  }, [activeTabId, flattenedHeadings, renderer.enhancedBodyHtml, isMarkdownPreview]);

  // Render Mermaid diagrams - debounced and limited for performance
  useEffect(() => {
    if (!isMarkdownPreview) return;
    const container = previewRef.current;
    if (!container) return;

    // Count mermaid diagrams to avoid performance issues
    const mermaidCount = container.querySelectorAll('.mermaid').length;
    if (mermaidCount > 20) {
      console.warn(`[PreviewPane] Too many Mermaid diagrams (${mermaidCount}), skipping render`);
      return;
    }

    const timer = window.setTimeout(() => {
      renderMermaidDiagrams(container);
    }, 100); // Increased delay for better batching
    return () => window.clearTimeout(timer);
  }, [renderer.enhancedBodyHtml, isMarkdownPreview, settings.themeMode]);

  // Warm preview images - optimized batch processing
  useEffect(() => {
    if (!isMarkdownPreview) return;
    const container = previewRef.current;
    if (!container) return;

    const images = Array.from(container.querySelectorAll('article.markdown-body img'));

    // Skip if too many images (performance protection)
    if (images.length > 100) {
      console.warn(`[PreviewPane] Too many images (${images.length}), skipping eager warmup`);
      return;
    }

    // Process images in batches with controlled concurrency
    const abortController = new AbortController();

    processInBatches(
      images,
      async (image) => {
        if (abortController.signal.aborted) return;

        const imgElement = image as HTMLImageElement;
        if (imgElement.getAttribute('data-preview-warmed') === 'true') return;

        const originalSrc = imgElement.getAttribute('data-original-src') || imgElement.getAttribute('src');
        if (!originalSrc) return;

        try {
          const cachedSrc = await warmPreviewImage(originalSrc, currentFilePath || undefined);
          if (abortController.signal.aborted || !imgElement.isConnected || !cachedSrc) return;

          if (imgElement.getAttribute('data-original-src') !== originalSrc) {
            imgElement.setAttribute('data-original-src', originalSrc);
          }
          if (imgElement.getAttribute('src') !== cachedSrc) {
            imgElement.setAttribute('src', cachedSrc);
            imgElement.src = cachedSrc;
          }
          imgElement.setAttribute('data-preview-warmed', 'true');
        } catch (error) {
          console.warn('Failed to warm preview image:', originalSrc, error);
        }
      },
      5, // batch size
      (completed, total) => {
        if (completed % 20 === 0) {
          console.log(`[PreviewPane] Warming images: ${completed}/${total}`);
        }
      }
    );

    return () => {
      abortController.abort();
    };
  }, [currentFilePath, renderer.enhancedBodyHtml, isMarkdownPreview]);

  // Asset preview (image/PDF)
  const [assetPreviewSrc, setAssetPreviewSrc] = useState('');
  
  useEffect(() => {
    let cancelled = false;

    if (isMarkdownPreview || isHtmlPreview || previewFileType === 'unsupported') {
      setAssetPreviewSrc('');
      return;
    }

    void (async () => {
      if (!currentFilePath) return;
      try {
        const src = previewFileType === 'image'
          ? await warmPreviewImage(currentFilePath, currentFilePath)
          : await resolvePreviewSource(currentFilePath, currentFilePath);
        if (!cancelled) setAssetPreviewSrc(src);
      } catch {
        if (!cancelled) setAssetPreviewSrc('');
      }
    })();

    return () => { cancelled = true; };
  }, [currentFilePath, isHtmlPreview, isMarkdownPreview, previewFileType]);

  // Handle click events
  const handlePreviewClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    
    // Ignore embed link clicks
    const embedLink = target?.closest('a[data-wiki-embed="true"], a.markdown-embed') as HTMLAnchorElement | null;
    if (embedLink) {
      event.preventDefault();
      return;
    }

    // WikiLink click
    const wikilink = target?.closest('a[data-wikilink]') as HTMLAnchorElement | null;
    if (wikilink) {
      event.preventDefault();
      const wikiTarget = wikilink.getAttribute('data-wikilink');
      if (!wikiTarget) return;
      await navigation.navigateToWikilink(wikiTarget);
      return;
    }

    // External link click
    const externalLink = target?.closest('a[href]') as HTMLAnchorElement | null;
    const href = externalLink?.getAttribute('href')?.trim() ?? '';
    if (externalLink && href && !href.startsWith('#') && isExternalLink(href) && isValidExternalUrl(href)) {
      event.preventDefault();
      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(href);
      } catch (error) {
        console.error('Failed to open external link:', href, error);
        showNotification(t('notifications_failedOpenLinkInBrowser'), 'error');
      }
      return;
    }

    // Anchor link click
    const anchorLink = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
    if (!anchorLink) return;

    const rawHash = anchorLink.getAttribute('href');
    if (!rawHash || rawHash === '#') return;

    const normalizedHash = decodeURIComponent(rawHash.slice(1)).trim();
    if (!normalizedHash) return;

    event.preventDefault();
    navigation.navigateToHashLink(normalizedHash);
  }, [navigation, showNotification]);

  // Handle double click events
  const handlePreviewDoubleClick = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    
    // Embed link double click
    const embedLink = target?.closest('a[data-wiki-embed="true"], a.markdown-embed') as HTMLAnchorElement | null;
    const embedTarget = embedLink?.dataset.wikiTarget?.trim() || embedLink?.dataset.wikilink?.trim();
    if (embedTarget) {
      event.preventDefault();
      const attachmentContext = createAttachmentResolverContext(files, rootFolderPath, currentFilePath);
      const resolvedAttachment = await resolveAttachmentTarget(attachmentContext, embedTarget);
      if (!resolvedAttachment) return;
      if (!isImageAttachment(resolvedAttachment.name)) {
        await handleRevealInExplorer(resolvedAttachment.path);
      }
      return;
    }

    // WikiLink double click
    const wikilink = target?.closest('a[data-wikilink]') as HTMLAnchorElement | null;
    const wikiTarget = wikilink?.getAttribute('data-wikilink');
    if (wikiTarget) {
      event.preventDefault();
      await navigation.navigateToWikilink(wikiTarget);
      return;
    }

    // Anchor link double click
    const anchorLink = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
    const rawHash = anchorLink?.getAttribute('href');
    if (rawHash && rawHash !== '#') {
      event.preventDefault();
      navigation.navigateToHashLink(decodeURIComponent(rawHash.slice(1)).trim());
      return;
    }

    // Attachment double click
    const attachment = target?.closest('[data-attachment-path]') as HTMLElement | null;
    const attachmentPath = attachment?.dataset.attachmentPath;
    if (!attachmentPath) return;

    event.preventDefault();
    await handleRevealInExplorer(attachmentPath);
  }, [currentFilePath, files, handleRevealInExplorer, navigation, rootFolderPath]);

  // Parse frontmatter for display
  const parsedFrontmatter = useMemo(() => {
    if (!isMarkdownPreview || !content) return null;
    const { frontmatter } = parseFrontmatter(content);
    return frontmatter;
  }, [content, isMarkdownPreview]);

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
          {isMarkdownPreview && parsedFrontmatter && (
            <div
              className="preview-pane-properties editor-pane-width-constrained mx-auto mb-4 w-full rounded-xl overflow-hidden bg-gray-50/50 dark:bg-white/5 animate-fade-in group/metadata"
              style={{ fontSize: `${settings.fontSize * 0.7}px` }}
            >
              <div className="preview-pane-properties-header px-4 py-2 bg-gray-100/50 dark:bg-white/5 font-semibold uppercase tracking-wider text-gray-400 flex justify-between items-center">
                <span>{t('preview_properties')}</span>
              </div>
              <div className="p-2 table w-full">
                {Object.entries(parsedFrontmatter).map(([key, value]) => (
                  <div key={key} className="table-row hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <div className="preview-pane-properties-cell table-cell py-1.5 px-2 w-32 text-gray-500 dark:text-gray-400 font-medium align-top">
                      {key}
                    </div>
                    <div className="preview-pane-properties-cell table-cell py-1.5 px-2 text-gray-800 dark:text-gray-200 align-top">
                      {key === 'link' && typeof value === 'string' && isExternalLink(value) && isValidExternalUrl(value) ? (
                        <a
                          href={value}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full break-all py-0.5 text-accent-DEFAULT underline underline-offset-2 hover:opacity-80"
                        >
                          {value}
                        </a>
                      ) : (
                        <input
                          type="text"
                          value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                          readOnly
                          className="preview-pane-properties-input w-full bg-transparent border-none focus:ring-0 py-0.5"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className={`editor-pane-sheet preview-pane-sheet w-full ${hasActiveFile ? '' : 'h-full min-h-0'}`}>
            {previewFileType === 'image' && assetPreviewSrc ? (
              <div className="editor-pane-width-constrained mx-auto flex min-h-[320px] w-full items-center justify-center py-6">
                <img
                  src={assetPreviewSrc}
                  alt={currentFilePath?.split(/[\\/]/).pop() || t('preview_imageAlt')}
                  className="preview-attachment-image max-h-[75vh] w-auto"
                />
              </div>
            ) : previewFileType === 'pdf' && assetPreviewSrc ? (
              <div className="editor-pane-width-constrained mx-auto w-full py-3">
                <iframe
                  src={`${assetPreviewSrc}#toolbar=0&navpanes=0&scrollbar=1`}
                  sandbox="allow-scripts allow-same-origin"
                  title={currentFilePath?.split(/[\\/]/).pop() || t('preview_pdfTitle')}
                  className="h-[78vh] w-full rounded-2xl bg-white dark:bg-black/30"
                />
              </div>
            ) : previewFileType === 'image' || previewFileType === 'pdf' ? (
              <div className="editor-pane-width-constrained mx-auto flex min-h-[320px] w-full items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                {t('preview_loading')}
              </div>
            ) : previewFileType === 'html' ? (
              <div
                className="preview-html-document editor-pane-width-constrained mx-auto w-full"
                dangerouslySetInnerHTML={{ __html: renderer.requiresAsyncEnhancement ? renderer.enhancedBodyHtml : renderer.sanitizedHtmlPreview }}
              />
            ) : previewFileType === 'unsupported' ? (
              <div className="editor-pane-width-constrained mx-auto flex min-h-[320px] w-full items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                {t('preview_unsupported')}
              </div>
            ) : (
              <article
                className={`markdown-body preview-pane-document ${isWindows ? 'preview-pane-document-windows' : ''} ${isCompact ? 'preview-pane-document-compact' : ''} ${hasActiveFile ? '' : 'h-full'}`}
                dangerouslySetInnerHTML={{ __html: renderer.requiresAsyncEnhancement ? renderer.enhancedBodyHtml : renderer.parsedContent.bodyHTML }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

PreviewPane.displayName = 'PreviewPane';
