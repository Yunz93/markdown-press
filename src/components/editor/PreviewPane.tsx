import React, { forwardRef, useRef, useMemo, useEffect, useImperativeHandle, useLayoutEffect, useCallback, useState } from 'react';
import DOMPurify from 'dompurify';
import { useAppStore, selectContent } from '../../store/appStore';
import { parseFrontmatter } from '../../utils/frontmatter';
import { renderMarkdown, useMarkdownRenderer } from '../../utils/markdown';
import { renderMermaidDiagrams } from '../../utils/markdown-extensions';
import { hydrateCachedPreviewImageSources, resolvePreviewSource, warmPreviewImage } from '../../utils/previewImageCache';
import { buildWikiReferenceTarget, extractWikiNoteFragment, parseWikiLinkReference, resolveWikiLinkFile } from '../../utils/wikiLinks';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useFileSystem } from '../../hooks/useFileSystem';
import { createAttachmentResolverContext, resolveAttachmentTarget } from '../../utils/attachmentResolver';
import { getPaneLayoutMetrics, type PaneDensity } from './paneLayout';
import { flushPendingPreviewHeadingScroll, registerPreviewPane, requestPreviewHeadingScroll, unregisterPreviewPane } from '../../utils/previewNavigationBridge';
import { createHeadingSlug, flattenHeadingNodes, parseHeadings, type HeadingNode } from '../../utils/outline';
import { getCompositeFontFamily } from '../../utils/fontSettings';
import { throttle } from '../../utils/throttle';

interface PreviewPaneProps {
  highlighter?: any;
  onScroll?: (percentage: number) => void;
  density?: PaneDensity;
}

export interface PreviewPaneHandle {
  cancelScrollSync: () => void;
  syncScrollTo: (percentage: number) => void;
}

// Lower threshold for smoother sync
const SCROLL_THRESHOLD = 5;
const SCROLL_EMIT_THRESHOLD = 0.001;
const HEADING_SCROLL_RETRY_DELAYS_MS = [48, 140];

interface HeadingScrollOptions {
  alignTopRatio?: number;
  alignMode?: 'top' | 'center';
  behavior?: ScrollBehavior;
}

const CENTERED_HEADING_SCROLL_OPTIONS: HeadingScrollOptions = {
  alignMode: 'center',
  behavior: 'smooth',
};

function isExternalLink(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href.trim());
}

/**
 * Validate external URL to prevent opening dangerous protocols
 * Only allows http:// and https:// URLs
 */
function isValidExternalUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function hasUriScheme(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value.trim());
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
  }) ?? Array.from(container.querySelectorAll<HTMLElement>('article.markdown-body h1, article.markdown-body h2, article.markdown-body h3, article.markdown-body h4, article.markdown-body h5, article.markdown-body h6'))
    .find((element) => headingCandidates.includes(element.textContent?.trim() || '')) ?? null;
}

function findBlockElementByReference(container: HTMLElement | null, rawReference: string): HTMLElement | null {
  if (!container) return null;

  const normalizedReference = rawReference.trim().replace(/^#+/, '').replace(/^\^/, '').trim();
  if (!normalizedReference) return null;

  return container.querySelector<HTMLElement>(`article.markdown-body [data-block-id="${CSS.escape(normalizedReference)}"]`);
}

function hasResolvableReference(
  headings: HeadingNode[],
  container: HTMLElement | null,
  rawReference: string
): boolean {
  return Boolean(
    findHeadingDefinitionByReference(headings, rawReference)
    || findHeadingElementByReference(container, rawReference)
    || findBlockElementByReference(container, rawReference)
  );
}

function scrollContainerToHeading(container: HTMLElement, target: HTMLElement, options?: HeadingScrollOptions): void {
  const targetRect = target.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const relativeTargetTop = container.scrollTop + targetRect.top - containerRect.top;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const alignTopRatio = Math.min(Math.max(options?.alignTopRatio ?? 0.18, 0, 1), 1);
  const targetTop = options?.alignMode === 'center'
    ? relativeTargetTop + targetRect.height / 2 - container.clientHeight / 2
    : relativeTargetTop - container.clientHeight * alignTopRatio;

  container.scrollTo({
    top: Math.min(Math.max(targetTop, 0), maxScrollTop),
    behavior: options?.behavior ?? 'smooth',
  });
}

export const PreviewPane = forwardRef<PreviewPaneHandle, PreviewPaneProps>(({
  highlighter,
  onScroll,
  density = 'comfortable' as PaneDensity
}, ref) => {
  const { settings, currentFilePath, rootFolderPath, files, fileContents, showNotification, activeTabId } = useAppStore();
  const content = useAppStore(selectContent);
  const fontFamily = useMemo(() => getCompositeFontFamily(settings), [settings.englishFontFamily, settings.chineseFontFamily]);
  const previewRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  useMarkdownRenderer(highlighter, settings.themeMode);
  const { handleFileSelect, handleRevealInExplorer } = useFileOperations();
  const { readFile } = useFileSystem();

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
  const previewFileType = useMemo(() => getPreviewFileType(currentFilePath), [currentFilePath]);
  const isMarkdownPreview = previewFileType === 'markdown';
  const isHtmlPreview = previewFileType === 'html';
  const [assetPreviewSrc, setAssetPreviewSrc] = useState('');
  const [enhancedBodyHtml, setEnhancedBodyHtml] = useState('');
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

    // Throttle pane width updates to 16ms (60fps) for better performance
    const throttledSetPaneWidth = throttle(setPaneWidth, 16);

    const updatePaneWidth = () => {
      const nextWidth = layout.getBoundingClientRect().width;
      if (nextWidth > 0) {
        throttledSetPaneWidth(nextWidth);
      }
    };

    updatePaneWidth();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      throttledSetPaneWidth(entry.contentRect.width);
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

    syncAnimationFrameRef.current = requestAnimationFrame(() => {
      const currentElement = previewRef.current;
      const target = syncTargetScrollTopRef.current;
      syncAnimationFrameRef.current = null;

      if (!currentElement || currentElement !== element || target === null) {
        syncTargetScrollTopRef.current = null;
        isSyncingScroll.current = false;
        return;
      }

      currentElement.scrollTop = target;
      syncTargetScrollTopRef.current = null;
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    });
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

  useImperativeHandle(ref, () => ({
    cancelScrollSync: cancelSyncedScroll,
    syncScrollTo: (percentage: number) => {
      const element = previewRef.current;
      if (!element) return;

      const scrollHeight = element.scrollHeight - element.clientHeight;
      if (scrollHeight <= 0) return;

      const targetScroll = scrollHeight * percentage;
      if (Math.abs(element.scrollTop - targetScroll) <= SCROLL_THRESHOLD) return;
      animateSyncedScroll(element, targetScroll);
    },
  }), [animateSyncedScroll, cancelSyncedScroll]);

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
    if (!isMarkdownPreview) {
      return { frontmatter: null, bodyHTML: '' };
    }

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
  }, [content, currentFilePath, highlighter?.__revision, isMarkdownPreview, settings.themeMode]);

  const flattenedHeadings = useMemo(
    () => (isMarkdownPreview ? flattenHeadingNodes(parseHeadings(content)) : []),
    [content, isMarkdownPreview]
  );
  const sanitizedHtmlPreview = useMemo(() => {
    if (!isHtmlPreview || !content) {
      return '';
    }

    return DOMPurify.sanitize(content, {
      ADD_TAGS: ['iframe', 'style'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'class', 'frameborder', 'href', 'id', 'rel', 'scrolling', 'src', 'style', 'target', 'title'],
    });
  }, [content, isHtmlPreview]);
  const attachmentResolverContext = useMemo(
    () => createAttachmentResolverContext(files, rootFolderPath, currentFilePath),
    [files, rootFolderPath, currentFilePath]
  );

  useEffect(() => {
    if (!isMarkdownPreview && !isHtmlPreview) {
      setEnhancedBodyHtml('');
      return;
    }

    const baseHtml = isMarkdownPreview ? parsedContent.bodyHTML : sanitizedHtmlPreview;
    setEnhancedBodyHtml(baseHtml);

    if (!baseHtml || typeof DOMParser === 'undefined') {
      return;
    }

    let cancelled = false;

    void (async () => {
      const parsed = new DOMParser().parseFromString(baseHtml, 'text/html');
      const embeds = isMarkdownPreview
        ? Array.from(parsed.body.querySelectorAll<HTMLElement>('[data-wiki-embed="true"], a.markdown-embed'))
        : [];
      const markdownImages = Array.from(parsed.body.querySelectorAll<HTMLImageElement>('img'));

      await Promise.all(markdownImages.map(async (image) => {
        const originalSrc = image.getAttribute('data-original-src')?.trim() || image.getAttribute('src')?.trim();
        if (!originalSrc) return;

        const resolvedAttachment = !hasUriScheme(originalSrc)
          ? await resolveAttachmentTarget(attachmentResolverContext, originalSrc)
          : null;
        const previewTarget = resolvedAttachment?.path ?? originalSrc;

        try {
          const warmedSrc = await warmPreviewImage(previewTarget, currentFilePath || undefined);
          image.setAttribute('src', warmedSrc);
        } catch {
          image.setAttribute('src', previewTarget);
        }

        image.setAttribute('data-original-src', previewTarget);
        image.setAttribute('decoding', 'async');
      }));

      if (embeds.length === 0) {
        if (!cancelled) {
          setEnhancedBodyHtml(parsed.body.innerHTML);
        }
        return;
      }

      await Promise.all(embeds.map(async (embed) => {
        const target = embed.dataset.wikiTarget?.trim() || embed.dataset.wikilink?.trim();
        const label = embed.dataset.wikiLabel?.trim() || embed.textContent?.trim() || '';
        if (!target) return;

        const parsedTarget = parseWikiLinkReference(target, { embed: true });
        const embedWidth = Number(embed.dataset.wikiWidth || parsedTarget.embedSize?.width || 0) || undefined;
        const embedHeight = Number(embed.dataset.wikiHeight || parsedTarget.embedSize?.height || 0) || undefined;
        const resolvedTarget = parsedTarget.path
          ? await resolveAttachmentTarget(attachmentResolverContext, target)
          : (currentFilePath
            ? {
                path: currentFilePath,
                name: currentFilePath.split(/[\\/]/).pop() || 'Current note',
              }
            : null);

        if (!resolvedTarget) {
          embed.className = 'preview-attachment-file preview-attachment-file-missing';
          embed.textContent = `Missing attachment: ${label || target}`;
          return;
        }

        if (isMarkdownNote(resolvedTarget.name)) {
          if (resolvedTarget.path === currentFilePath && !parsedTarget.subpath.trim()) {
            embed.className = 'preview-attachment-file preview-attachment-file-missing';
            embed.textContent = 'Cannot embed the entire current note into itself';
            return;
          }

          const sourceContent = resolvedTarget.path === currentFilePath && activeTabId
            ? fileContents[activeTabId] ?? content
            : await readFile({
                id: resolvedTarget.path,
                name: resolvedTarget.name,
                type: 'file',
                path: resolvedTarget.path,
              });
          const fragment = extractWikiNoteFragment(sourceContent, target);

          if (!fragment.markdown) {
            embed.className = 'preview-attachment-file preview-attachment-file-missing';
            embed.textContent = `Missing reference: ${label || target}`;
            return;
          }

          const noteEmbed = parsed.createElement('section');
          noteEmbed.className = 'preview-note-embed';
          if (embedWidth) {
            noteEmbed.style.maxWidth = `${embedWidth}px`;
          }
          if (embedHeight) {
            noteEmbed.style.maxHeight = `${embedHeight}px`;
            noteEmbed.style.overflow = 'auto';
          }

          const title = parsed.createElement('div');
          title.className = 'preview-note-embed-title';
          title.textContent = label || fragment.title;

          const body = parsed.createElement('article');
          body.className = 'markdown-body preview-note-embed-body';
          body.innerHTML = renderMarkdown(fragment.markdown, {
            highlighter,
            themeMode: settings.themeMode,
          });

          noteEmbed.append(title, body);
          embed.replaceWith(noteEmbed);
          return;
        }

        if (isImageAttachment(resolvedTarget.name)) {
          const image = parsed.createElement('img');
          image.className = 'preview-attachment-image';
          image.alt = label || resolvedTarget.name;
          image.setAttribute('data-original-src', resolvedTarget.path);
          if (embedWidth) {
            image.style.width = `${embedWidth}px`;
          }
          if (embedHeight) {
            image.style.height = `${embedHeight}px`;
            image.style.objectFit = 'contain';
          }

          try {
            image.src = await warmPreviewImage(resolvedTarget.path, currentFilePath || undefined);
          } catch {
            image.src = resolvedTarget.path;
          }

          embed.replaceWith(image);
          return;
        }

        if (isPdfAttachment(resolvedTarget.name)) {
          const pdfFrame = parsed.createElement('iframe');
          pdfFrame.className = 'preview-attachment-pdf';
          pdfFrame.title = label || resolvedTarget.name;
          if (embedWidth) {
            pdfFrame.style.width = `${embedWidth}px`;
          }
          if (embedHeight) {
            pdfFrame.style.height = `${embedHeight}px`;
          }

          try {
            pdfFrame.src = await resolvePreviewSource(resolvedTarget.path, currentFilePath || undefined);
            embed.replaceWith(pdfFrame);
          } catch {
            embed.className = 'preview-attachment-file preview-attachment-file-missing';
            embed.textContent = `Failed to preview attachment: ${label || resolvedTarget.name}`;
          }
          return;
        }

        const attachment = parsed.createElement('a');
        attachment.className = 'preview-attachment-file';
        attachment.setAttribute('href', '#');
        attachment.dataset.attachmentPath = resolvedTarget.path;
        attachment.dataset.attachmentName = resolvedTarget.name;
        attachment.title = `Double-click to reveal ${resolvedTarget.name}`;

        const fileName = parsed.createElement('span');
        fileName.className = 'preview-attachment-file-name';
        fileName.textContent = label || resolvedTarget.name;

        const hint = parsed.createElement('span');
        hint.className = 'preview-attachment-file-hint';
        hint.textContent = 'Double-click to reveal in Finder';

        attachment.append(fileName, hint);
        embed.replaceWith(attachment);
      }));

      if (!cancelled) {
        setEnhancedBodyHtml(parsed.body.innerHTML);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeTabId,
    attachmentResolverContext,
    content,
    currentFilePath,
    fileContents,
    highlighter,
    isHtmlPreview,
    isMarkdownPreview,
    parsedContent.bodyHTML,
    readFile,
    sanitizedHtmlPreview,
    settings.themeMode,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!currentFilePath || previewFileType === 'markdown' || previewFileType === 'html' || previewFileType === 'unsupported') {
      setAssetPreviewSrc('');
      return;
    }

    void (async () => {
      try {
        const nextSrc = previewFileType === 'image'
          ? await warmPreviewImage(currentFilePath, currentFilePath)
          : await resolvePreviewSource(currentFilePath, currentFilePath);

        if (!cancelled) {
          setAssetPreviewSrc(nextSrc);
        }
      } catch (error) {
        console.error('Failed to resolve preview asset source:', error);
        if (!cancelled) {
          setAssetPreviewSrc('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentFilePath, previewFileType]);

  const scrollToReferenceWithRetry = useCallback((referenceId: string, options?: HeadingScrollOptions): boolean => {
    if (!isMarkdownPreview) return false;
    clearHeadingScrollRetries();

    const attemptScroll = (rawReference?: string) => {
      const container = previewRef.current;
      if (!container) return false;

      const target = findHeadingElementByReference(container, referenceId)
        || findBlockElementByReference(container, referenceId)
        || (rawReference ? findHeadingElementByReference(container, rawReference) : null)
        || (rawReference ? findBlockElementByReference(container, rawReference) : null);

      if (target) {
        scrollContainerToHeading(container, target, options);
        return true;
      }

      return false;
    };

    if (attemptScroll(referenceId)) {
      return true;
    }

    headingScrollAnimationFrameRef.current = requestAnimationFrame(() => {
      headingScrollAnimationFrameRef.current = null;
      if (attemptScroll(referenceId)) return;

      headingScrollTimeoutRefs.current = HEADING_SCROLL_RETRY_DELAYS_MS.map((delay) => window.setTimeout(() => {
        attemptScroll(referenceId);
      }, delay));
    });

    return false;
  }, [clearHeadingScrollRetries, isMarkdownPreview]);

  const navigateToWikilink = useCallback(async (wikiTarget: string): Promise<boolean> => {
    const parsedReference = parseWikiLinkReference(wikiTarget);
    const explicitReferenceTarget = buildWikiReferenceTarget(parsedReference);

    if (!parsedReference.subpathType && parsedReference.path.trim()) {
      const matchedHeading = findHeadingDefinitionByReference(flattenedHeadings, wikiTarget);
      if (matchedHeading) {
        scrollToReferenceWithRetry(matchedHeading.id, CENTERED_HEADING_SCROLL_OPTIONS);
        return true;
      }
    }

    if (!parsedReference.path.trim() && explicitReferenceTarget) {
      const canResolveReference = hasResolvableReference(flattenedHeadings, previewRef.current, explicitReferenceTarget);
      if (!canResolveReference) {
        showNotification(`Reference not found: ${wikiTarget}`, 'error');
        return true;
      }

      scrollToReferenceWithRetry(explicitReferenceTarget, CENTERED_HEADING_SCROLL_OPTIONS);
      return true;
    }

    const matchedHeading = findHeadingDefinitionByReference(flattenedHeadings, wikiTarget);
    if (matchedHeading) {
      scrollToReferenceWithRetry(matchedHeading.id, CENTERED_HEADING_SCROLL_OPTIONS);
      return true;
    }

    if (wikiTarget.trim().startsWith('#')) {
      const matchedElement = findHeadingElementByReference(previewRef.current, wikiTarget);
      const matchedBlock = findBlockElementByReference(previewRef.current, wikiTarget);
      if (matchedBlock) {
        scrollToReferenceWithRetry(matchedBlock.dataset.blockId ?? wikiTarget, CENTERED_HEADING_SCROLL_OPTIONS);
        return true;
      }
      if (!matchedElement) {
        showNotification(`Heading not found: ${wikiTarget}`, 'error');
        return true;
      }

      scrollToReferenceWithRetry(matchedElement.dataset.headingId ?? matchedElement.id, CENTERED_HEADING_SCROLL_OPTIONS);
      return true;
    }

    const matchedFile = resolveWikiLinkFile(files, wikiTarget, rootFolderPath, currentFilePath);
    if (!matchedFile) {
      showNotification(`Linked file not found: ${wikiTarget}`, 'error');
      return true;
    }

    await handleFileSelect(matchedFile);
    if (explicitReferenceTarget) {
      requestPreviewHeadingScroll(matchedFile.id, explicitReferenceTarget, CENTERED_HEADING_SCROLL_OPTIONS);
    }
    return true;
  }, [flattenedHeadings, files, rootFolderPath, currentFilePath, handleFileSelect, scrollToReferenceWithRetry, showNotification]);

  const navigateToHashLink = useCallback((normalizedHash: string): boolean => {
    const blockElement = findBlockElementByReference(previewRef.current, normalizedHash);
    if (blockElement) {
      return scrollToReferenceWithRetry(blockElement.dataset.blockId ?? normalizedHash, CENTERED_HEADING_SCROLL_OPTIONS) || true;
    }

    const matchedHeading = findHeadingDefinitionByReference(flattenedHeadings, normalizedHash);
    if (matchedHeading) {
      return scrollToReferenceWithRetry(matchedHeading.id, CENTERED_HEADING_SCROLL_OPTIONS) || true;
    }

    if (normalizedHash.trim().startsWith('#')) {
      const fallbackHeading = findHeadingDefinitionByReference(flattenedHeadings, normalizedHash.trim().slice(1));
      if (fallbackHeading) {
        return scrollToReferenceWithRetry(fallbackHeading.id, CENTERED_HEADING_SCROLL_OPTIONS) || true;
      }
    }

    const matchedElement = findHeadingElementByReference(previewRef.current, normalizedHash);
    if (!matchedElement && normalizedHash.trim().startsWith('#')) {
      const fallbackElement = findHeadingElementByReference(previewRef.current, normalizedHash.trim().slice(1));
      if (!fallbackElement) return false;

      return scrollToReferenceWithRetry(fallbackElement.dataset.headingId ?? fallbackElement.id, CENTERED_HEADING_SCROLL_OPTIONS) || true;
    }

    if (!matchedElement) return false;

    return scrollToReferenceWithRetry(matchedElement.dataset.headingId ?? matchedElement.id, CENTERED_HEADING_SCROLL_OPTIONS) || true;
  }, [flattenedHeadings, scrollToReferenceWithRetry]);

  useLayoutEffect(() => {
    if (!isMarkdownPreview) return;
    const container = previewRef.current;
    if (!container) return;

    const headingElements = Array.from(container.querySelectorAll<HTMLElement>('article.markdown-body h1, article.markdown-body h2, article.markdown-body h3, article.markdown-body h4, article.markdown-body h5, article.markdown-body h6'));

    headingElements.forEach((element, index) => {
      const heading = flattenedHeadings[index];
      if (!heading) {
        (element as HTMLElement).removeAttribute('data-heading-id');
        (element as HTMLElement).removeAttribute('data-heading-slug');
        (element as HTMLElement).removeAttribute('data-heading-text');
        return;
      }

      (element as HTMLElement).id = heading.id;
      (element as HTMLElement).dataset.headingId = heading.id;
      (element as HTMLElement).dataset.headingSlug = createHeadingSlug(heading.text);
      (element as HTMLElement).dataset.headingText = heading.text;
    });

    flushPendingPreviewHeadingScroll(activeTabId);
  }, [activeTabId, enhancedBodyHtml, flattenedHeadings, isMarkdownPreview]);

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
    if (externalLink && href && !href.startsWith('#') && isExternalLink(href) && isValidExternalUrl(href)) {
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
    if (!isMarkdownPreview) return;
    const timer = window.setTimeout(() => {
      renderMermaidDiagrams(previewRef.current);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [enhancedBodyHtml, isMarkdownPreview, settings.themeMode]);

  useEffect(() => {
    if (!isMarkdownPreview) return;
    const container = previewRef.current;
    if (!container) return;

    let cancelled = false;
    const images = Array.from(container.querySelectorAll('article.markdown-body img'));

    void Promise.all(images.map(async (image: Element) => {
      const imgElement = image as HTMLImageElement;
      const originalSrc = imgElement.getAttribute('data-original-src') || imgElement.getAttribute('src');
      if (!originalSrc) return;

      const cachedSrc = await warmPreviewImage(originalSrc, currentFilePath || undefined);
      if (cancelled || !imgElement.isConnected || !cachedSrc) return;

      if (imgElement.getAttribute('data-original-src') !== originalSrc) {
        imgElement.setAttribute('data-original-src', originalSrc);
      }

      if (imgElement.getAttribute('src') !== cachedSrc) {
        imgElement.setAttribute('src', cachedSrc);
        imgElement.src = cachedSrc;
      }
    }));

    return () => {
      cancelled = true;
    };
  }, [currentFilePath, enhancedBodyHtml, isMarkdownPreview]);

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
        {isMarkdownPreview && parsedContent.frontmatter && (
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
            {previewFileType === 'image' && assetPreviewSrc ? (
              <div className="editor-pane-width-constrained mx-auto flex min-h-[320px] w-full items-center justify-center py-6">
                <img
                  src={assetPreviewSrc}
                  alt={currentFilePath?.split(/[\\/]/).pop() || 'Preview image'}
                  className="preview-attachment-image max-h-[75vh] w-auto"
                />
              </div>
            ) : previewFileType === 'pdf' && assetPreviewSrc ? (
              <div className="editor-pane-width-constrained mx-auto w-full py-3">
                <iframe
                  src={`${assetPreviewSrc}#toolbar=0&navpanes=0&scrollbar=1`}
                  sandbox="allow-scripts allow-same-origin"
                  title={currentFilePath?.split(/[\\/]/).pop() || 'PDF preview'}
                  className="h-[78vh] w-full rounded-2xl border border-gray-200/70 bg-white shadow-sm dark:border-white/10 dark:bg-black/30"
                />
              </div>
            ) : previewFileType === 'image' || previewFileType === 'pdf' ? (
              <div className="editor-pane-width-constrained mx-auto flex min-h-[320px] w-full items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                Loading preview...
              </div>
            ) : previewFileType === 'html' ? (
              <div
                className="preview-html-document editor-pane-width-constrained mx-auto w-full"
                style={{ fontFamily, fontSize: `${settings.fontSize}px` }}
                dangerouslySetInnerHTML={{ __html: enhancedBodyHtml || sanitizedHtmlPreview }}
              />
            ) : previewFileType === 'unsupported' ? (
              <div className="editor-pane-width-constrained mx-auto flex min-h-[320px] w-full items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
                Preview is not supported for this file type.
              </div>
            ) : (
              <article
                className={`markdown-body preview-pane-document ${isCompact ? 'preview-pane-document-compact' : ''} ${hasActiveFile ? '' : 'h-full'}`}
                style={{ fontFamily, fontSize: `${settings.fontSize}px` }}
                dangerouslySetInnerHTML={{ __html: enhancedBodyHtml || parsedContent.bodyHTML }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

PreviewPane.displayName = 'PreviewPane';
