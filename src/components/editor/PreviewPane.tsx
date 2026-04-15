/**
 * PreviewPane - 简化重构版
 * 
 * 使用新提取的 hooks：
 * - usePreviewRenderer: Markdown/HTML 渲染
 * - usePreviewScroll: 滚动同步
 * - useWikiLinkNavigation: WikiLink 导航
 */

import React, { forwardRef, useRef, useMemo, useImperativeHandle, useLayoutEffect, useCallback, useState, useEffect, useDeferredValue } from 'react';
import { useAppStore, selectContent } from '../../store/appStore';
import { getPaneLayoutMetrics, type PaneDensity } from './paneLayout';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileSystem } from '../../hooks/useFileSystem';
import { getResolvedCodeFontFamily, getResolvedPreviewFontFamily } from '../../utils/fontSettings';
import { usePreviewRenderer, usePreviewScroll, useWikiLinkNavigation } from './hooks';
import { throttle } from '../../utils/throttle';
import { useThrottledResize } from '../../utils/performance';
import { resolvePreviewSource, warmPreviewImage } from '../../utils/previewImageCache';
import { createAttachmentResolverContext, resolveAttachmentTarget } from '../../utils/attachmentResolver';
import { renderMermaidDiagrams } from '../../utils/markdown-extensions';
import { createHeadingSlug, flattenHeadingNodes, parseHeadings } from '../../utils/outline';
import { parseFrontmatter } from '../../utils/frontmatter';
import { isWindowsPlatform } from '../../utils/platform';
import type { FileNode, Frontmatter } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import type { ShikiHighlighter } from '../../hooks/useShikiHighlighter';

interface PreviewPaneProps {
  highlighter?: ShikiHighlighter | null;
  onScroll?: (percentage: number) => void;
  density?: PaneDensity;
  syncedPercentage?: number | null;
}

export interface PreviewPaneHandle {
  cancelScrollSync: () => void;
  syncScrollTo: (percentage: number, options?: { immediate?: boolean }) => void;
  getScrollPosition: () => { top: number; left: number };
  restoreScrollPosition: (position: { top: number; left: number }) => void;
  scrollToTop: () => void;
}

function syncPreviewContainerScroll(element: HTMLElement, percentage: number): void {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  if (maxScrollTop <= 0) return;
  element.scrollTop = maxScrollTop * Math.min(Math.max(percentage, 0), 1);
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

function isVideoAttachment(fileName: string): boolean {
  return /\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(fileName);
}

function isHtmlDocument(fileName: string): boolean {
  return /\.html?$/i.test(fileName);
}

function getPreviewFileType(filePath: string | null | undefined): 'markdown' | 'image' | 'video' | 'pdf' | 'html' | 'unsupported' {
  if (!filePath) return 'markdown';
  if (isImageAttachment(filePath)) return 'image';
  if (isVideoAttachment(filePath)) return 'video';
  if (isPdfAttachment(filePath)) return 'pdf';
  if (isHtmlDocument(filePath)) return 'html';
  if (isMarkdownNote(filePath)) return 'markdown';
  return 'unsupported';
}

type FrontmatterValue = Frontmatter[keyof Frontmatter];

function getFrontmatterDisplayItems(value: FrontmatterValue): string[] {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
    return items.length > 0 ? items : [''];
  }

  if (value === null || value === undefined) {
    return [''];
  }

  return [String(value)];
}

export const PreviewPane = forwardRef<PreviewPaneHandle, PreviewPaneProps>(({
  highlighter,
  onScroll,
  density = 'comfortable' as PaneDensity,
  syncedPercentage = null,
}, ref) => {
  const { t } = useI18n();
  const { settings, currentFilePath, rootFolderPath, files, showNotification, activeTabId } = useAppStore();
  const content = useAppStore(selectContent);
  const previewContent = useDeferredValue(content);
  const previewFontFamily = useMemo(() => getResolvedPreviewFontFamily(settings), [settings.previewFontFamily]);
  const codeFontFamily = useMemo(() => getResolvedCodeFontFamily(settings), [settings.codeFontFamily]);
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
    isMarkdownPreview ? flattenHeadingNodes(parseHeadings(previewContent)) : []
  ), [isMarkdownPreview, previewContent]);

  // Pane layout state - use ref to avoid re-render
  const [layoutMetrics, setLayoutMetrics] = useState(() => getPaneLayoutMetrics(0, density));
  const metricsRef = useRef(layoutMetrics);

  // Optimized resize handling
  const observeResize = useThrottledResize((width) => {
    const newMetrics = getPaneLayoutMetrics(width, density);
    metricsRef.current = newMetrics;
    setLayoutMetrics(newMetrics);
  }, 16);

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
    '--preview-content-bottom': `max(${layoutMetrics.contentPaddingBottom}px, 40vh)`,
    '--preview-font-family': previewFontFamily,
    '--preview-font-size': `${settings.fontSize}px`,
    '--preview-code-font-family': codeFontFamily,
    '--preview-code-font-size': `${Math.max(12, settings.fontSize - 2)}px`,
  }) as React.CSSProperties, [layoutMetrics, previewFontFamily, settings.fontSize, codeFontFamily]);

  // Optimized pane resize tracking
  useLayoutEffect(() => {
    observeResize(layoutRef.current);
  }, [observeResize]);

  // Preview renderer hook
  const renderer = usePreviewRenderer({
    content: previewContent,
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
    content: previewContent,
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
    syncScrollTo: (percentage: number, options?: { immediate?: boolean }) => {
      const element = previewRef.current;
      if (!element) return;
      scroll.syncScrollTo(element, percentage, options);
    },
    getScrollPosition: () => {
      const element = previewRef.current;
      return {
        top: element?.scrollTop ?? 0,
        left: element?.scrollLeft ?? 0,
      };
    },
    restoreScrollPosition: (position: { top: number; left: number }) => {
      const element = previewRef.current;
      if (!element) return;
      scroll.cancelScrollSync();
      element.scrollTo(position);
    },
    scrollToTop: () => {
      const element = previewRef.current;
      if (!element) return;
      element.scrollTo({ top: 0, behavior: 'auto' });
    },
  }), [scroll]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element || syncedPercentage === null) return;
    scroll.syncScrollTo(element, syncedPercentage);
  }, [scroll, syncedPercentage]);

  useLayoutEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    scroll.flushPendingScrollSync(element);
  }, [scroll, renderer.enhancedBodyHtml, renderer.parsedContent.bodyHTML, activeTabId]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const ro = new ResizeObserver(() => {
      scroll.flushPendingScrollSync(element);
    });
    ro.observe(element);
    return () => ro.disconnect();
  }, [scroll]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    element.scrollTo({ top: 0, left: 0 });
    scroll.cancelScrollSync();
  }, [activeTabId, scroll.cancelScrollSync]);

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

  // Asset preview (image/video/PDF)
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
    if (!isMarkdownPreview || !previewContent) return null;
    const { frontmatter } = parseFrontmatter(previewContent);
    return frontmatter;
  }, [isMarkdownPreview, previewContent]);
  const frontmatterEntries = useMemo(() => (
    parsedFrontmatter ? Object.entries(parsedFrontmatter) as Array<[string, FrontmatterValue]> : []
  ), [parsedFrontmatter]);

  // Keep hook order stable after the property editor was removed.
  const [_propertyDrafts] = useState<Record<string, string>>({});
  const [_editingPropertyKey] = useState<string | null>(null);
  useEffect(() => {}, [frontmatterEntries, parsedFrontmatter]);
  useEffect(() => {}, [parsedFrontmatter]);
  const _commitPropertyDraft = useCallback((_key: string, _rawDraft?: string) => {}, []);
  const _handlePropertyChange = useCallback((_key: string, _value: string) => {}, []);
  const _handlePropertyFocus = useCallback((_key: string) => {}, []);
  const _handlePropertyBlur = useCallback((_key: string) => {}, []);
  const _handlePropertyKeyDown = useCallback((
    _event: React.KeyboardEvent<HTMLTextAreaElement>,
    _key: string
  ) => {}, []);

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
            >
              <div className="preview-pane-properties-header px-4 py-2 bg-gray-100/50 dark:bg-white/5 font-semibold uppercase tracking-wider text-gray-400 flex justify-between items-center">
                <span>{t('preview_properties')}</span>
              </div>
              <div className="p-2 table w-full">
                {frontmatterEntries.map(([key, value]) => (
                  <div key={key} className="table-row hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <div className="preview-pane-properties-cell table-cell py-1.5 px-2 w-32 whitespace-nowrap text-gray-500 dark:text-gray-400 font-medium align-top">
                      {key}
                    </div>
                    <div className="preview-pane-properties-cell table-cell py-1.5 px-2 text-gray-800 dark:text-gray-200 align-top">
                      {key === 'link'
                        && typeof value === 'string'
                        && isExternalLink(value)
                        && isValidExternalUrl(value) ? (
                          <a
                            href={value}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full break-all py-0.5 text-accent-DEFAULT underline underline-offset-2 hover:opacity-80"
                          >
                            {value}
                          </a>
                        ) : Array.isArray(value) ? (
                          <div className="preview-pane-properties-multi-value">
                            {getFrontmatterDisplayItems(value).map((item, index) => (
                              <span
                                key={`${key}-${index}-${item}`}
                                className={`preview-pane-properties-multi-value-item ${item ? '' : 'is-empty'}`}
                              >
                                {item || '\u2014'}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="preview-pane-properties-static whitespace-pre-wrap break-words py-0.5">
                            {getFrontmatterDisplayItems(value)[0] || '\u2014'}
                          </div>
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
            ) : previewFileType === 'video' && assetPreviewSrc ? (
              <div className="editor-pane-width-constrained mx-auto w-full py-6">
                <video
                  src={assetPreviewSrc}
                  controls
                  playsInline
                  preload="metadata"
                  className="preview-pane-video-player w-full"
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
            ) : previewFileType === 'image' || previewFileType === 'video' || previewFileType === 'pdf' ? (
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
