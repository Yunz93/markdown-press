/**
 * WikiLink Navigation Hook
 * 
 * 处理预览面板中的 WikiLink 点击和导航
 */

import { useCallback, useRef, useEffect } from 'react';
import { buildWikiReferenceTarget, parseWikiLinkReference, resolveWikiLinkFile } from '../../../utils/wikiLinks';
import { requestPreviewHeadingScroll, flushPendingPreviewHeadingScroll, registerPreviewPane, unregisterPreviewPane } from '../../../utils/previewNavigationBridge';
import { createHeadingSlug, flattenHeadingNodes, parseHeadings, type HeadingNode } from '../../../utils/outline';
import type { FileNode } from '../../../types';
import { useAppStore } from '../../../store/appStore';
import { t } from '../../../utils/i18n';

export interface HeadingScrollOptions {
  alignTopRatio?: number;
  alignMode?: 'top' | 'center';
  behavior?: ScrollBehavior;
}

const CENTERED_HEADING_SCROLL_OPTIONS: HeadingScrollOptions = {
  alignMode: 'center',
  behavior: 'smooth',
};

const HEADING_SCROLL_RETRY_DELAYS_MS = [48, 140];

export interface UseWikiLinkNavigationOptions {
  content: string;
  currentFilePath?: string | null;
  rootFolderPath?: string | null;
  files: FileNode[];
  activeTabId?: string | null;
  isMarkdownPreview: boolean;
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
  handleFileSelect: (file: FileNode) => Promise<void>;
}

export interface UseWikiLinkNavigationReturn {
  // 导航到 WikiLink
  navigateToWikilink: (wikiTarget: string) => Promise<boolean>;
  // 导航到 hash link
  navigateToHashLink: (normalizedHash: string) => boolean;
  // 滚动到引用
  scrollToReference: (referenceId: string, options?: HeadingScrollOptions) => boolean;
  // 查找标题元素
  findHeadingElement: (container: HTMLElement | null, rawReference: string) => HTMLElement | null;
  // 查找块元素
  findBlockElement: (container: HTMLElement | null, rawReference: string) => HTMLElement | null;
  // 注册预览面板
  registerPane: (container: HTMLElement) => void;
  // 注销预览面板
  unregisterPane: (container: HTMLElement) => void;
  // 清理
  clearScrollRetries: () => void;
}

// Helper functions
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

  // First try: find by data attributes
  const byDataAttr = Array.from(container.querySelectorAll<HTMLElement>('article.markdown-body [data-heading-id]')).find((element) => {
    const headingId = element.dataset.headingId ?? '';
    const headingSlug = element.dataset.headingSlug ?? '';
    const headingText = (element.dataset.headingText ?? '').trim();
    return headingCandidates.includes(headingId)
      || headingCandidates.includes(headingSlug)
      || headingCandidates.includes(headingText);
  });
  
  if (byDataAttr) return byDataAttr;
  
  // Second try: find by id attribute
  const byId = container.querySelector<HTMLElement>(`article.markdown-body [id="${CSS.escape(normalizedReference)}"]`);
  if (byId) return byId;
  
  // Third try: find by slugified id
  const bySlugId = container.querySelector<HTMLElement>(`article.markdown-body [id="${CSS.escape(createHeadingSlug(normalizedReference))}"]`);
  if (bySlugId) return bySlugId;
  
  // Final try: find by text content
  return Array.from(container.querySelectorAll<HTMLElement>('article.markdown-body h1, article.markdown-body h2, article.markdown-body h3, article.markdown-body h4, article.markdown-body h5, article.markdown-body h6'))
    .find((element) => {
      const text = element.textContent?.trim() || '';
      const textSlug = createHeadingSlug(text);
      return headingCandidates.includes(text) || headingCandidates.includes(textSlug);
    }) ?? null;
}

function findBlockElementByReference(container: HTMLElement | null, rawReference: string): HTMLElement | null {
  if (!container) return null;

  const normalizedReference = rawReference.trim().replace(/^#+/, '').replace(/^\^/, '').trim();
  if (!normalizedReference) return null;

  return container.querySelector<HTMLElement>(`article.markdown-body [data-block-id="${CSS.escape(normalizedReference)}"]`);
}

function scrollContainerToHeading(container: HTMLElement, target: HTMLElement, options?: HeadingScrollOptions): void {
  void container.offsetHeight;
  void target.offsetHeight;
  
  const targetRect = target.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const relativeTargetTop = container.scrollTop + targetRect.top - containerRect.top;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  
  let targetTop: number;
  if (options?.alignMode === 'center') {
    targetTop = relativeTargetTop + targetRect.height / 2 - container.clientHeight / 2;
  } else {
    const alignTopRatio = Math.min(Math.max(options?.alignTopRatio ?? 0.12, 0, 1), 1);
    targetTop = relativeTargetTop - container.clientHeight * alignTopRatio;
  }
  
  targetTop = Math.min(Math.max(targetTop, 0), maxScrollTop);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.scrollTo({
        top: targetTop,
        behavior: options?.behavior ?? 'smooth',
      });
    });
  });
}

export function useWikiLinkNavigation(options: UseWikiLinkNavigationOptions): UseWikiLinkNavigationReturn {
  const {
    content,
    currentFilePath,
    rootFolderPath,
    files,
    activeTabId,
    isMarkdownPreview,
    showNotification,
    handleFileSelect,
  } = options;

  const flattenedHeadings = flattenHeadingNodes(parseHeadings(content));
  
  const containerRef = useRef<HTMLElement | null>(null);
  const headingScrollAnimationFrameRef = useRef<number | null>(null);
  const headingScrollTimeoutRefs = useRef<number[]>([]);

  // Clear scroll retries
  const clearScrollRetries = useCallback(() => {
    if (headingScrollAnimationFrameRef.current !== null) {
      cancelAnimationFrame(headingScrollAnimationFrameRef.current);
      headingScrollAnimationFrameRef.current = null;
    }

    for (const timeoutId of headingScrollTimeoutRefs.current) {
      window.clearTimeout(timeoutId);
    }
    headingScrollTimeoutRefs.current = [];
  }, []);

  // Scroll to reference with retry
  const scrollToReference = useCallback((referenceId: string, scrollOptions?: HeadingScrollOptions): boolean => {
    if (!isMarkdownPreview) return false;
    clearScrollRetries();

    const attemptScroll = (rawReference?: string): boolean => {
      const container = containerRef.current;
      if (!container) return false;

      let target = findHeadingElementByReference(container, referenceId)
        || findBlockElementByReference(container, referenceId);
      
      if (!target && rawReference) {
        target = findHeadingElementByReference(container, rawReference)
          || findBlockElementByReference(container, rawReference);
      }
      
      if (!target) {
        target = container.querySelector(`[id="${CSS.escape(referenceId)}"]`) as HTMLElement | null;
      }

      if (target) {
        scrollContainerToHeading(container, target, scrollOptions);
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
  }, [clearScrollRetries, isMarkdownPreview]);

  // Navigate to WikiLink
  const navigateToWikilink = useCallback(async (wikiTarget: string): Promise<boolean> => {
    const parsedReference = parseWikiLinkReference(wikiTarget);
    const explicitReferenceTarget = buildWikiReferenceTarget(parsedReference);

    if (!parsedReference.subpathType && parsedReference.path.trim()) {
      const matchedHeading = findHeadingDefinitionByReference(flattenedHeadings, wikiTarget);
      if (matchedHeading) {
        scrollToReference(matchedHeading.id, CENTERED_HEADING_SCROLL_OPTIONS);
        return true;
      }
    }

    if (!parsedReference.path.trim() && explicitReferenceTarget) {
      const container = containerRef.current;
      const canResolve = Boolean(
        findHeadingDefinitionByReference(flattenedHeadings, explicitReferenceTarget)
        || findHeadingElementByReference(container, explicitReferenceTarget)
        || findBlockElementByReference(container, explicitReferenceTarget)
      );
      
      if (!canResolve) {
        showNotification(t(useAppStore.getState().settings.language, 'notifications_referenceNotFound', { target: wikiTarget }), 'error');
        return true;
      }

      scrollToReference(explicitReferenceTarget, CENTERED_HEADING_SCROLL_OPTIONS);
      return true;
    }

    const matchedHeading = findHeadingDefinitionByReference(flattenedHeadings, wikiTarget);
    if (matchedHeading) {
      scrollToReference(matchedHeading.id, CENTERED_HEADING_SCROLL_OPTIONS);
      return true;
    }

    if (wikiTarget.trim().startsWith('#')) {
      const container = containerRef.current;
      const matchedElement = findHeadingElementByReference(container, wikiTarget);
      const matchedBlock = findBlockElementByReference(container, wikiTarget);
      if (matchedBlock) {
        scrollToReference(matchedBlock.dataset.blockId ?? wikiTarget, CENTERED_HEADING_SCROLL_OPTIONS);
        return true;
      }
      if (!matchedElement) {
        showNotification(t(useAppStore.getState().settings.language, 'notifications_headingNotFound', { target: wikiTarget }), 'error');
        return true;
      }

      scrollToReference(matchedElement.dataset.headingId ?? matchedElement.id, CENTERED_HEADING_SCROLL_OPTIONS);
      return true;
    }

    const matchedFile = resolveWikiLinkFile(files, wikiTarget, rootFolderPath, currentFilePath);
    if (!matchedFile) {
      showNotification(t(useAppStore.getState().settings.language, 'notifications_linkedFileNotFound', { target: wikiTarget }), 'error');
      return true;
    }

    await handleFileSelect(matchedFile);
    if (explicitReferenceTarget) {
      requestPreviewHeadingScroll(matchedFile.id, explicitReferenceTarget, CENTERED_HEADING_SCROLL_OPTIONS);
    }
    return true;
  }, [flattenedHeadings, files, rootFolderPath, currentFilePath, handleFileSelect, scrollToReference, showNotification]);

  // Navigate to hash link
  const navigateToHashLink = useCallback((normalizedHash: string): boolean => {
    const container = containerRef.current;
    const blockElement = findBlockElementByReference(container, normalizedHash);
    if (blockElement) {
      return scrollToReference(blockElement.dataset.blockId ?? normalizedHash, CENTERED_HEADING_SCROLL_OPTIONS) || true;
    }

    const matchedHeading = findHeadingDefinitionByReference(flattenedHeadings, normalizedHash);
    if (matchedHeading) {
      return scrollToReference(matchedHeading.id, CENTERED_HEADING_SCROLL_OPTIONS) || true;
    }

    if (normalizedHash.trim().startsWith('#')) {
      const fallbackHeading = findHeadingDefinitionByReference(flattenedHeadings, normalizedHash.trim().slice(1));
      if (fallbackHeading) {
        return scrollToReference(fallbackHeading.id, CENTERED_HEADING_SCROLL_OPTIONS) || true;
      }
    }

    const matchedElement = findHeadingElementByReference(container, normalizedHash);
    if (!matchedElement && normalizedHash.trim().startsWith('#')) {
      const fallbackElement = findHeadingElementByReference(container, normalizedHash.trim().slice(1));
      if (!fallbackElement) return false;
      return scrollToReference(fallbackElement.dataset.headingId ?? fallbackElement.id, CENTERED_HEADING_SCROLL_OPTIONS) || true;
    }

    if (!matchedElement) return false;

    return scrollToReference(matchedElement.dataset.headingId ?? matchedElement.id, CENTERED_HEADING_SCROLL_OPTIONS) || true;
  }, [flattenedHeadings, scrollToReference]);

  // Register/unregister preview pane
  const registerPane = useCallback((container: HTMLElement) => {
    containerRef.current = container;
    if (activeTabId) {
      registerPreviewPane(activeTabId, container);
      flushPendingPreviewHeadingScroll(activeTabId);
    }
  }, [activeTabId]);

  const unregisterPane = useCallback((container: HTMLElement) => {
    if (activeTabId) {
      unregisterPreviewPane(activeTabId, container);
    }
    if (containerRef.current === container) {
      containerRef.current = null;
    }
  }, [activeTabId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearScrollRetries();
    };
  }, [clearScrollRetries]);

  return {
    navigateToWikilink,
    navigateToHashLink,
    scrollToReference,
    findHeadingElement: findHeadingElementByReference,
    findBlockElement: findBlockElementByReference,
    registerPane,
    unregisterPane,
    clearScrollRetries,
  };
}
