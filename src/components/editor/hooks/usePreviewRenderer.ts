/**
 * Preview Renderer Hook
 * 
 * 处理预览面板的渲染逻辑：
 * - Markdown 渲染
 * - HTML 增强（图片、嵌入）
 * - 资源解析
 */

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { renderMarkdown, useMarkdownRenderer, clearMarkdownCache } from '../../../utils/markdown';
import { resolvePreviewSource, warmPreviewImage } from '../../../utils/previewImageCache';
import { parseWikiLinkReference, extractWikiNoteFragment } from '../../../utils/wikiLinks';
import { createAttachmentResolverContext, resolveAttachmentTarget } from '../../../utils/attachmentResolver';
import type { FileNode } from '../../../types';
import type { MarkdownStylePreset, OrderedListMode } from '../../../types';
import type { ShikiHighlighter } from '../../../hooks/useShikiHighlighter';
import {
  buildIframeEmbed,
  configurePreviewImageElement,
  createPreviewPdfContainer,
  hasEmbeddableMediaLinksInHtml,
  hasUriScheme,
  hasWikiEmbedsInHtml,
  isHtmlDocument,
  isImageAttachment,
  isMarkdownNote,
  isPdfAttachment,
  isVideoAttachment,
  normalizeExistingIframe,
  resolveExternalVideoEmbed,
} from '../preview/previewMedia';
import {
  getBasePreviewHtml,
  renderMarkdownPreview,
  sanitizeHtmlPreview,
  shouldUseAsyncPreviewEnhancement,
} from '../preview/previewRenderCore';
import {
  protectShikiPresInHtmlString,
  restoreShikiPresFromSnapshots,
} from '../preview/shikiHtmlSnapshots';

export interface UsePreviewRendererOptions {
  content: string;
  currentFilePath?: string | null;
  isMarkdownPreview: boolean;
  isHtmlPreview: boolean;
  highlighter?: ShikiHighlighter | null;
  themeMode?: 'light' | 'dark';
  markdownStylePreset?: MarkdownStylePreset;
  orderedListMode?: OrderedListMode;
  files: FileNode[];
  rootFolderPath?: string | null;
  fileContents: Record<string, string>;
  activeTabId?: string | null;
  readFile: (file: FileNode) => Promise<string>;
  enabled?: boolean;
}

export interface UsePreviewRendererReturn {
  // 渲染结果
  parsedContent: { frontmatter: Record<string, unknown> | null; bodyHTML: string };
  enhancedBodyHtml: string;
  sanitizedHtmlPreview: string;
  requiresAsyncEnhancement: boolean;
}

export function usePreviewRenderer(options: UsePreviewRendererOptions): UsePreviewRendererReturn {
  const {
    content,
    currentFilePath,
    isMarkdownPreview,
    isHtmlPreview,
    highlighter,
    themeMode = 'light',
    markdownStylePreset = 'nord',
    orderedListMode = 'strict',
    files,
    rootFolderPath,
    fileContents,
    activeTabId,
    readFile,
    enabled = true,
  } = options;

  // Initialize markdown renderer
  useMarkdownRenderer(highlighter ?? null, themeMode);

  // Clear stale cache entries when the highlighter becomes available,
  // ensuring previously-cached unhighlighted renders don't persist.
  const hadHighlighterRef = useRef(Boolean(highlighter));
  useEffect(() => {
    const hasHighlighter = Boolean(highlighter);
    if (hasHighlighter && !hadHighlighterRef.current) {
      clearMarkdownCache();
    }
    hadHighlighterRef.current = hasHighlighter;
  }, [highlighter]);

  // Parse markdown content
  const parsedContent = useMemo(() => {
    if (!enabled) {
      return { frontmatter: null, bodyHTML: '' };
    }

    return renderMarkdownPreview({
      content,
      currentFilePath,
      highlighter,
      isMarkdownPreview,
      themeMode,
      markdownStylePreset,
      orderedListMode,
    });
  }, [content, currentFilePath, enabled, highlighter, isMarkdownPreview, markdownStylePreset, orderedListMode, themeMode]);

  // Sanitize HTML for HTML preview
  const sanitizedHtmlPreview = useMemo(() => {
    if (!enabled) return '';
    return sanitizeHtmlPreview(content, isHtmlPreview);
  }, [content, enabled, isHtmlPreview]);

  const basePreviewHtml = useMemo(
    () => getBasePreviewHtml(isMarkdownPreview, parsedContent.bodyHTML, sanitizedHtmlPreview),
    [isMarkdownPreview, parsedContent.bodyHTML, sanitizedHtmlPreview]
  );

  const requiresAsyncEnhancement = useMemo(
    () => shouldUseAsyncPreviewEnhancement(basePreviewHtml, isMarkdownPreview),
    [basePreviewHtml, isMarkdownPreview]
  );

  const [enhancedBodyHtml, setEnhancedBodyHtml] = useState(() => basePreviewHtml);
  const basePreviewHtmlRef = useRef(basePreviewHtml);
  const enhancedBodyHtmlRef = useRef(enhancedBodyHtml);
  useEffect(() => {
    enhancedBodyHtmlRef.current = enhancedBodyHtml;
  }, [enhancedBodyHtml]);

  // When the article uses async-enhanced HTML, sync `enhancedBodyHtml` → `basePreviewHtml` in a
  // layout effect so the DOM matches before PreviewPane's Mermaid `useLayoutEffect`. When async
  // enhancement is off, the article uses `parsedContent.bodyHTML` only — do not push `basePreviewHtml`
  // into `enhancedBodyHtml` every keystroke (that caused regressions / extra churn).
  useLayoutEffect(() => {
    if (!isMarkdownPreview && !isHtmlPreview) {
      basePreviewHtmlRef.current = '';
      setEnhancedBodyHtml('');
      enhancedBodyHtmlRef.current = '';
      return;
    }

    if (!enabled) {
      return;
    }

    if (!basePreviewHtml || typeof document === 'undefined') {
      basePreviewHtmlRef.current = basePreviewHtml;
      setEnhancedBodyHtml(basePreviewHtml);
      return;
    }

    if (requiresAsyncEnhancement && basePreviewHtml !== basePreviewHtmlRef.current) {
      basePreviewHtmlRef.current = basePreviewHtml;
      setEnhancedBodyHtml(basePreviewHtml);
    } else {
      basePreviewHtmlRef.current = basePreviewHtml;
    }
  }, [basePreviewHtml, enabled, isHtmlPreview, isMarkdownPreview, requiresAsyncEnhancement]);

  // Attachment resolver context
  const attachmentResolverContext = useMemo(
    () => createAttachmentResolverContext(files, rootFolderPath, currentFilePath),
    [files, rootFolderPath, currentFilePath]
  );

  // Enhance HTML with embeds and images
  useEffect(() => {
    if (!isMarkdownPreview && !isHtmlPreview) {
      setEnhancedBodyHtml('');
      enhancedBodyHtmlRef.current = '';
      return;
    }

    if (!enabled) {
      return;
    }

    if (!basePreviewHtml || typeof document === 'undefined') {
      basePreviewHtmlRef.current = basePreviewHtml;
      setEnhancedBodyHtml(basePreviewHtml);
      return;
    }

    if (!requiresAsyncEnhancement) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        // WKWebView can strip Shiki token inline styles when reading subtree HTML back via
        // `innerHTML` after mutations (same symptom DomParser round-trips had). Substitute
        // `<pre class="shiki">` fragments from the source strings and restore after readback.
        const host = document.createElement('div');
        const shikiSnapshots: string[] = [];
        host.innerHTML = protectShikiPresInHtmlString(basePreviewHtml, shikiSnapshots);
        const embeds = isMarkdownPreview
          ? Array.from(host.querySelectorAll<HTMLElement>('[data-wiki-embed], a.markdown-embed'))
          : [];
        const markdownImages = Array.from(host.querySelectorAll<HTMLImageElement>('img'));
        const markdownVideos = Array.from(host.querySelectorAll<HTMLVideoElement>('video'));
        const markdownSources = Array.from(host.querySelectorAll<HTMLSourceElement>('source[src]'));
        const iframes = Array.from(host.querySelectorAll<HTMLIFrameElement>('iframe'));
        const anchorParagraphs = Array.from(host.querySelectorAll<HTMLParagraphElement>('p'));

        // Process images
        await Promise.all(markdownImages.map(async (image) => {
          try {
            const originalSrc = image.getAttribute('data-original-src')?.trim() || image.getAttribute('src')?.trim();
            if (!originalSrc) return;

            const resolvedAttachment = !hasUriScheme(originalSrc)
              ? await resolveAttachmentTarget(attachmentResolverContext, originalSrc)
              : null;
            const previewTarget = resolvedAttachment?.path ?? originalSrc;
            const resolvedName = resolvedAttachment?.name ?? previewTarget.split(/[\\/]/).pop() ?? previewTarget;

            if (isVideoAttachment(resolvedName)) {
              const video = document.createElement('video');
              video.className = 'preview-attachment-video';
              video.controls = true;
              video.playsInline = true;
              video.preload = 'metadata';
              video.src = await resolvePreviewSource(previewTarget, currentFilePath || undefined);
              image.replaceWith(video);
              return;
            }

            try {
              const warmedSrc = await warmPreviewImage(previewTarget, currentFilePath || undefined);
              configurePreviewImageElement(image, warmedSrc, previewTarget);
            } catch {
              configurePreviewImageElement(image, previewTarget, previewTarget);
            }
          } catch (error) {
            console.warn('Failed to process image:', error);
          }
        }));

        await Promise.all(markdownVideos.map(async (video) => {
          try {
            video.classList.add('preview-attachment-video');
            video.controls = true;
            video.playsInline = true;
            if (!video.getAttribute('preload')) {
              video.preload = 'metadata';
            }

            const originalSrc = video.getAttribute('src')?.trim();
            if (!originalSrc || hasUriScheme(originalSrc)) {
              return;
            }

            const resolvedTarget = await resolveAttachmentTarget(attachmentResolverContext, originalSrc);
            const previewTarget = resolvedTarget?.path ?? originalSrc;
            video.src = await resolvePreviewSource(previewTarget, currentFilePath || undefined);
          } catch (error) {
            console.warn('Failed to process video:', error);
          }
        }));

        await Promise.all(markdownSources.map(async (source) => {
          try {
            const originalSrc = source.getAttribute('src')?.trim();
            if (!originalSrc || hasUriScheme(originalSrc)) {
              return;
            }

            const resolvedTarget = await resolveAttachmentTarget(attachmentResolverContext, originalSrc);
            const previewTarget = resolvedTarget?.path ?? originalSrc;
            source.src = await resolvePreviewSource(previewTarget, currentFilePath || undefined);
          } catch (error) {
            console.warn('Failed to process video source:', error);
          }
        }));

        iframes.forEach((frame) => {
          const src = frame.getAttribute('src')?.trim();
          if (!src) return;
          if (!resolveExternalVideoEmbed(src)) return;
          normalizeExistingIframe(frame);
        });

        anchorParagraphs.forEach((paragraph) => {
          const meaningfulChildren = Array.from(paragraph.childNodes).filter((node) => (
            node.nodeType !== Node.TEXT_NODE || node.textContent?.trim()
          ));
          if (meaningfulChildren.length !== 1) return;

          const anchor = meaningfulChildren[0];
          if (!(anchor instanceof HTMLAnchorElement)) return;

          const href = anchor.getAttribute('href')?.trim();
          if (!href) return;

          const externalVideo = resolveExternalVideoEmbed(href);
          if (!externalVideo) return;

          paragraph.replaceWith(buildIframeEmbed(document, externalVideo));
        });

      if (embeds.length === 0) {
        if (!cancelled) {
          const nextHtml = restoreShikiPresFromSnapshots(host.innerHTML, shikiSnapshots);
          if (nextHtml !== enhancedBodyHtmlRef.current) {
            setEnhancedBodyHtml(nextHtml);
          }
        }
        return;
      }

      // Process embeds
      await Promise.all(embeds.map(async (embed) => {
        try {
          const target = embed.dataset.wikiTarget?.trim() || embed.dataset.wikilink?.trim();
          const label = embed.dataset.wikiLabel?.trim() || embed.textContent?.trim() || '';
          if (!target) return;

          const parsedTarget = parseWikiLinkReference(target, { embed: true });
          const embedWidth = Number(embed.dataset.wikiWidth || parsedTarget.embedSize?.width || 0) || undefined;
          const embedHeight = Number(embed.dataset.wikiHeight || parsedTarget.embedSize?.height || 0) || undefined;
          
          let resolvedTarget;
          try {
            resolvedTarget = parsedTarget.path
              ? await resolveAttachmentTarget(attachmentResolverContext, target)
              : (currentFilePath
                ? { path: currentFilePath, name: currentFilePath.split(/[\\/]/).pop() || 'Current note' }
                : null);
          } catch {
            resolvedTarget = null;
          }

          if (!resolvedTarget) {
            embed.className = 'preview-attachment-file preview-attachment-file-missing';
            embed.textContent = `Missing attachment: ${label || target}`;
            if (embedWidth) embed.style.maxWidth = `${embedWidth}px`;
            if (embedHeight) {
              embed.style.maxHeight = `${embedHeight}px`;
              embed.style.overflow = 'auto';
            }
            return;
          }

          // Markdown note embed
          if (isMarkdownNote(resolvedTarget.name)) {
            if (resolvedTarget.path === currentFilePath && !parsedTarget.subpath.trim()) {
              embed.className = 'preview-attachment-file preview-attachment-file-missing';
              embed.textContent = 'Cannot embed the entire current note into itself';
              return;
            }

            let sourceContent;
            try {
              sourceContent = resolvedTarget.path === currentFilePath && activeTabId
                ? fileContents[activeTabId] ?? content
                : await readFile({
                    id: resolvedTarget.path,
                    name: resolvedTarget.name,
                    type: 'file',
                    path: resolvedTarget.path,
                  });
            } catch {
              embed.className = 'preview-attachment-file preview-attachment-file-missing';
              embed.textContent = `Failed to read: ${label || target}`;
              return;
            }
            
            const fragment = extractWikiNoteFragment(sourceContent, target);

            if (!fragment.markdown) {
              embed.className = 'preview-attachment-file preview-attachment-file-missing';
              embed.textContent = `Missing reference: ${label || target}`;
              return;
            }

            const noteEmbed = document.createElement('section');
            noteEmbed.className = 'preview-note-embed';
            if (embedWidth) noteEmbed.style.maxWidth = `${embedWidth}px`;
            if (embedHeight) {
              noteEmbed.style.maxHeight = `${embedHeight}px`;
              noteEmbed.style.overflow = 'auto';
            }

            const title = document.createElement('div');
            title.className = 'preview-note-embed-title';
            title.textContent = label || fragment.title;

            const body = document.createElement('article');
            body.className = 'markdown-body preview-note-embed-body';
            try {
              const noteHtml = protectShikiPresInHtmlString(
                renderMarkdown(fragment.markdown, { highlighter, themeMode, markdownStylePreset, orderedListMode }),
                shikiSnapshots,
              );
              body.innerHTML = noteHtml;
            } catch {
              body.innerHTML = `<p>Error rendering content</p>`;
            }

            noteEmbed.append(title, body);
            embed.replaceWith(noteEmbed);
            return;
          }

          // Image embed
          if (isImageAttachment(resolvedTarget.name)) {
            const image = document.createElement('img');
            image.className = 'preview-attachment-image';
            image.alt = label || resolvedTarget.name;
            if (embedWidth) {
              // Inline `!important` guards against preview CSS or WKWebView style quirks
              // that can otherwise override the embed sizing.
              image.style.setProperty('width', `${embedWidth}px`, 'important');
              image.style.setProperty('max-width', `${embedWidth}px`, 'important');
              // Survives innerHTML → dangerouslySetInnerHTML round-trips better than style alone
              // in some WKWebView release builds; sized via preview.css `attr(...)`.
              // Typed CSS attr(... px) expects a bare number, not "200px".
              image.setAttribute('data-wiki-embed-w', String(embedWidth));
            }
            if (embedHeight) {
              image.style.setProperty('height', `${embedHeight}px`, 'important');
              image.style.setProperty('max-height', `${embedHeight}px`, 'important');
              image.style.objectFit = 'contain';
              image.setAttribute('data-wiki-embed-h', String(embedHeight));
            }

            try {
              const warmedSrc = await warmPreviewImage(resolvedTarget.path, currentFilePath || undefined);
              configurePreviewImageElement(image, warmedSrc, resolvedTarget.path);
            } catch {
              configurePreviewImageElement(image, resolvedTarget.path, resolvedTarget.path);
            }

            embed.replaceWith(image);
            return;
          }

          if (isVideoAttachment(resolvedTarget.name)) {
            const video = document.createElement('video');
            video.className = 'preview-attachment-video';
            video.controls = true;
            video.playsInline = true;
            video.preload = 'metadata';
            if (embedWidth) video.style.width = `${embedWidth}px`;
            if (embedHeight) video.style.height = `${embedHeight}px`;

            try {
              video.src = await resolvePreviewSource(resolvedTarget.path, currentFilePath || undefined);
              embed.replaceWith(video);
            } catch {
              embed.className = 'preview-attachment-file preview-attachment-file-missing';
              embed.textContent = `Failed to preview attachment: ${label || resolvedTarget.name}`;
            }
            return;
          }

          // PDF embed
          if (isPdfAttachment(resolvedTarget.name)) {
            try {
              const pdfSrc = await resolvePreviewSource(resolvedTarget.path, currentFilePath || undefined);
              const pdfContainer = createPreviewPdfContainer(document, pdfSrc, label || resolvedTarget.name, resolvedTarget.path);
              if (embedWidth) pdfContainer.style.width = `${embedWidth}px`;
              if (embedHeight) pdfContainer.style.height = `${embedHeight}px`;
              embed.replaceWith(pdfContainer);
            } catch {
              embed.className = 'preview-attachment-file preview-attachment-file-missing';
              embed.textContent = `Failed to preview attachment: ${label || resolvedTarget.name}`;
            }
            return;
          }

          // Generic attachment
          const attachment = document.createElement('a');
          attachment.className = 'preview-attachment-file';
          attachment.setAttribute('href', '#');
          attachment.dataset.attachmentPath = resolvedTarget.path;
          attachment.dataset.attachmentName = resolvedTarget.name;
          attachment.title = `Double-click to reveal ${resolvedTarget.name}`;
          if (embedWidth) attachment.style.maxWidth = `${embedWidth}px`;
          if (embedHeight) {
            attachment.style.maxHeight = `${embedHeight}px`;
            attachment.style.overflow = 'auto';
          }

          const fileName = document.createElement('span');
          fileName.className = 'preview-attachment-file-name';
          fileName.textContent = label || resolvedTarget.name;

          const hint = document.createElement('span');
          hint.className = 'preview-attachment-file-hint';
          hint.textContent = 'Double-click to reveal in Finder';

          attachment.append(fileName, hint);
          embed.replaceWith(attachment);
        } catch (error) {
          console.warn('Failed to process embed:', error);
        }
      }));

      if (!cancelled) {
        const nextHtml = restoreShikiPresFromSnapshots(host.innerHTML, shikiSnapshots);
        if (nextHtml !== enhancedBodyHtmlRef.current) {
          setEnhancedBodyHtml(nextHtml);
        }
      }
    } catch (error) {
      console.error('Preview renderer error:', error);
      if (!cancelled) {
        setEnhancedBodyHtml(basePreviewHtml);
      }
    }})();

    return () => {
      cancelled = true;
    };
  }, [
    activeTabId,
    attachmentResolverContext,
    content,
    currentFilePath,
    enabled,
    fileContents,
    highlighter,
    isHtmlPreview,
    isMarkdownPreview,
    basePreviewHtml,
    requiresAsyncEnhancement,
    readFile,
    themeMode,
    orderedListMode,
  ]);

  return {
    parsedContent,
    enhancedBodyHtml,
    sanitizedHtmlPreview,
    requiresAsyncEnhancement,
  };
}
