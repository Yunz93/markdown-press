/**
 * Preview Renderer Hook
 * 
 * 处理预览面板的渲染逻辑：
 * - Markdown 渲染
 * - HTML 增强（图片、嵌入）
 * - 资源解析
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { parseFrontmatter } from '../../../utils/frontmatter';
import { renderMarkdown, useMarkdownRenderer, clearMarkdownCache } from '../../../utils/markdown';
import { hydrateCachedPreviewImageSources, resolvePreviewSource, warmPreviewImage } from '../../../utils/previewImageCache';
import { parseWikiLinkReference, extractWikiNoteFragment } from '../../../utils/wikiLinks';
import { createAttachmentResolverContext, resolveAttachmentTarget } from '../../../utils/attachmentResolver';
import type { FileNode } from '../../../types';
import type { ShikiHighlighter } from '../../../hooks/useShikiHighlighter';

export interface UsePreviewRendererOptions {
  content: string;
  currentFilePath?: string | null;
  isMarkdownPreview: boolean;
  isHtmlPreview: boolean;
  highlighter?: ShikiHighlighter | null;
  themeMode?: 'light' | 'dark';
  files: FileNode[];
  rootFolderPath?: string | null;
  fileContents: Record<string, string>;
  activeTabId?: string | null;
  readFile: (file: FileNode) => Promise<string>;
}

export interface UsePreviewRendererReturn {
  // 渲染结果
  parsedContent: { frontmatter: Record<string, unknown> | null; bodyHTML: string };
  enhancedBodyHtml: string;
  sanitizedHtmlPreview: string;
  assetPreviewSrc: string;
  requiresAsyncEnhancement: boolean;
}

// Helper functions
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

function isVideoAttachment(fileName: string): boolean {
  return /\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(fileName);
}

function isHtmlDocument(fileName: string): boolean {
  return /\.html?$/i.test(fileName);
}

function hasWikiEmbedsInHtml(html: string): boolean {
  return html.includes('data-wiki-embed="true"') || html.includes('class="markdown-link markdown-embed"');
}

function hasEmbeddableMediaLinksInHtml(html: string): boolean {
  return /href="https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com|bilibili\.com|player\.bilibili\.com)\//i.test(html);
}

interface ExternalVideoEmbed {
  provider: 'youtube' | 'bilibili';
  src: string;
  title: string;
}

function resolveYouTubeEmbed(url: URL): ExternalVideoEmbed | null {
  const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
  let videoId = '';

  if (hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';
  } else if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v') ?? '';
    } else if (url.pathname.startsWith('/shorts/')) {
      videoId = url.pathname.split('/')[2] ?? '';
    } else if (url.pathname.startsWith('/embed/')) {
      videoId = url.pathname.split('/')[2] ?? '';
    }
  } else if (hostname === 'youtube-nocookie.com' && url.pathname.startsWith('/embed/')) {
    videoId = url.pathname.split('/')[2] ?? '';
  }

  if (!videoId) return null;

  const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  const start = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (start) {
    embedUrl.searchParams.set('start', start.replace(/s$/i, ''));
  }

  return {
    provider: 'youtube',
    src: embedUrl.toString(),
    title: 'YouTube video',
  };
}

function resolveBilibiliEmbed(url: URL): ExternalVideoEmbed | null {
  const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

  if (hostname === 'player.bilibili.com' && url.pathname === '/player.html') {
    return {
      provider: 'bilibili',
      src: url.toString(),
      title: 'Bilibili video',
    };
  }

  if (!hostname.endsWith('bilibili.com')) {
    return null;
  }

  const match = url.pathname.match(/\/video\/((?:BV[\w]+)|(?:av\d+))/i);
  if (!match) return null;

  const rawId = match[1];
  const embedUrl = new URL('https://player.bilibili.com/player.html');

  if (/^BV/i.test(rawId)) {
    embedUrl.searchParams.set('bvid', rawId);
  } else {
    embedUrl.searchParams.set('aid', rawId.replace(/^av/i, ''));
  }

  const page = url.searchParams.get('p');
  if (page) {
    embedUrl.searchParams.set('page', page);
  }

  return {
    provider: 'bilibili',
    src: embedUrl.toString(),
    title: 'Bilibili video',
  };
}

function resolveExternalVideoEmbed(rawUrl: string): ExternalVideoEmbed | null {
  try {
    const url = new URL(rawUrl);
    return resolveYouTubeEmbed(url) ?? resolveBilibiliEmbed(url);
  } catch {
    return null;
  }
}

function buildIframeEmbed(document: Document, embed: ExternalVideoEmbed): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `preview-external-video-embed is-${embed.provider}`;

  const frame = document.createElement('iframe');
  frame.className = 'preview-external-video-frame';
  frame.src = embed.src;
  frame.title = embed.title;
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  frame.setAttribute(
    'allow',
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
  );

  wrapper.appendChild(frame);
  return wrapper;
}

function normalizeExistingIframe(frame: HTMLIFrameElement): void {
  frame.classList.add('preview-external-video-frame');
  if (!frame.getAttribute('loading')) {
    frame.setAttribute('loading', 'lazy');
  }
  if (!frame.getAttribute('referrerpolicy')) {
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  }
  if (!frame.getAttribute('allow')) {
    frame.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    );
  }
  frame.setAttribute('allowfullscreen', 'true');
}

function configurePreviewImageElement(image: HTMLImageElement, src: string, originalSrc: string): void {
  image.setAttribute('src', src);
  image.setAttribute('data-original-src', originalSrc);
  image.setAttribute('data-preview-warmed', 'true');
  image.setAttribute('decoding', 'sync');
  image.setAttribute('loading', 'eager');
  image.setAttribute('fetchpriority', 'high');
}

export function usePreviewRenderer(options: UsePreviewRendererOptions): UsePreviewRendererReturn {
  const {
    content,
    currentFilePath,
    isMarkdownPreview,
    isHtmlPreview,
    highlighter,
    themeMode = 'light',
    files,
    rootFolderPath,
    fileContents,
    activeTabId,
    readFile,
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
    if (!isMarkdownPreview) {
      return { frontmatter: null, bodyHTML: '' };
    }

    if (!content) return { frontmatter: null, bodyHTML: '' };

    const { frontmatter, body } = parseFrontmatter(content);
    try {
      const bodyHTML = hydrateCachedPreviewImageSources(
        renderMarkdown(body, { highlighter, themeMode }),
        currentFilePath || undefined
      );
      return { frontmatter, bodyHTML };
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return { frontmatter, bodyHTML: '<p>Error rendering markdown</p>' };
    }
  }, [content, currentFilePath, highlighter, isMarkdownPreview, themeMode]);

  // Sanitize HTML for HTML preview
  const sanitizedHtmlPreview = useMemo(() => {
    if (!isHtmlPreview || !content) {
      return '';
    }

    return DOMPurify.sanitize(content, {
      ADD_TAGS: ['iframe', 'style'],
      ADD_ATTR: ['allow', 'allowfullscreen', 'class', 'frameborder', 'href', 'id', 'rel', 'scrolling', 'src', 'style', 'target', 'title'],
    });
  }, [content, isHtmlPreview]);

  const basePreviewHtml = useMemo(
    () => (isMarkdownPreview ? parsedContent.bodyHTML : sanitizedHtmlPreview),
    [isMarkdownPreview, parsedContent.bodyHTML, sanitizedHtmlPreview]
  );

  const hasWikiEmbeds = useMemo(
    () => isMarkdownPreview && hasWikiEmbedsInHtml(basePreviewHtml),
    [basePreviewHtml, isMarkdownPreview]
  );

  const requiresAsyncEnhancement = useMemo(
    () => Boolean(basePreviewHtml) && (
      basePreviewHtml.includes('<img')
      || basePreviewHtml.includes('<video')
      || basePreviewHtml.includes('<source')
      || basePreviewHtml.includes('<iframe')
      || hasWikiEmbeds
      || hasEmbeddableMediaLinksInHtml(basePreviewHtml)
    ),
    [basePreviewHtml, hasWikiEmbeds]
  );

  const [enhancedBodyHtml, setEnhancedBodyHtml] = useState(() => basePreviewHtml);
  const [assetPreviewSrc, setAssetPreviewSrc] = useState('');
  const basePreviewHtmlRef = useRef(basePreviewHtml);
  const enhancedBodyHtmlRef = useRef(enhancedBodyHtml);
  useEffect(() => {
    enhancedBodyHtmlRef.current = enhancedBodyHtml;
  }, [enhancedBodyHtml]);

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

    if (!basePreviewHtml || typeof DOMParser === 'undefined') {
      basePreviewHtmlRef.current = basePreviewHtml;
      setEnhancedBodyHtml(basePreviewHtml);
      return;
    }

    const basePreviewHtmlChanged = basePreviewHtml !== basePreviewHtmlRef.current;
    if (basePreviewHtmlChanged) {
      basePreviewHtmlRef.current = basePreviewHtml;
      setEnhancedBodyHtml(basePreviewHtml);
    }

    if (!requiresAsyncEnhancement) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const parsed = new DOMParser().parseFromString(basePreviewHtml, 'text/html');
        const embeds = isMarkdownPreview
          ? Array.from(parsed.body.querySelectorAll<HTMLElement>('[data-wiki-embed="true"], a.markdown-embed'))
          : [];
        const markdownImages = Array.from(parsed.body.querySelectorAll<HTMLImageElement>('img'));
        const markdownVideos = Array.from(parsed.body.querySelectorAll<HTMLVideoElement>('video'));
        const markdownSources = Array.from(parsed.body.querySelectorAll<HTMLSourceElement>('source[src]'));
        const iframes = Array.from(parsed.body.querySelectorAll<HTMLIFrameElement>('iframe'));
        const anchorParagraphs = Array.from(parsed.body.querySelectorAll<HTMLParagraphElement>('p'));

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
              const video = parsed.createElement('video');
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

          paragraph.replaceWith(buildIframeEmbed(parsed, externalVideo));
        });

      if (embeds.length === 0) {
        if (!cancelled) {
          const nextHtml = parsed.body.innerHTML;
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

            const noteEmbed = parsed.createElement('section');
            noteEmbed.className = 'preview-note-embed';
            if (embedWidth) noteEmbed.style.maxWidth = `${embedWidth}px`;
            if (embedHeight) {
              noteEmbed.style.maxHeight = `${embedHeight}px`;
              noteEmbed.style.overflow = 'auto';
            }

            const title = parsed.createElement('div');
            title.className = 'preview-note-embed-title';
            title.textContent = label || fragment.title;

            const body = parsed.createElement('article');
            body.className = 'markdown-body preview-note-embed-body';
            try {
              body.innerHTML = renderMarkdown(fragment.markdown, { highlighter, themeMode });
            } catch {
              body.innerHTML = `<p>Error rendering content</p>`;
            }

            noteEmbed.append(title, body);
            embed.replaceWith(noteEmbed);
            return;
          }

          // Image embed
          if (isImageAttachment(resolvedTarget.name)) {
            const image = parsed.createElement('img');
            image.className = 'preview-attachment-image';
            image.alt = label || resolvedTarget.name;
            if (embedWidth) image.style.width = `${embedWidth}px`;
            if (embedHeight) {
              image.style.height = `${embedHeight}px`;
              image.style.objectFit = 'contain';
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
            const video = parsed.createElement('video');
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
            const pdfFrame = parsed.createElement('iframe');
            pdfFrame.className = 'preview-attachment-pdf';
            pdfFrame.title = label || resolvedTarget.name;
            if (embedWidth) pdfFrame.style.width = `${embedWidth}px`;
            if (embedHeight) pdfFrame.style.height = `${embedHeight}px`;

            try {
              pdfFrame.src = await resolvePreviewSource(resolvedTarget.path, currentFilePath || undefined);
              embed.replaceWith(pdfFrame);
            } catch {
              embed.className = 'preview-attachment-file preview-attachment-file-missing';
              embed.textContent = `Failed to preview attachment: ${label || resolvedTarget.name}`;
            }
            return;
          }

          // Generic attachment
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
        } catch (error) {
          console.warn('Failed to process embed:', error);
        }
      }));

      if (!cancelled) {
        const nextHtml = parsed.body.innerHTML;
        if (nextHtml !== enhancedBodyHtmlRef.current) {
          setEnhancedBodyHtml(nextHtml);
        }
      }
    } catch (error) {
      console.error('Preview renderer error:', error);
      if (!cancelled && basePreviewHtmlChanged) {
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
    fileContents,
    highlighter,
    isHtmlPreview,
    isMarkdownPreview,
    basePreviewHtml,
    requiresAsyncEnhancement,
    readFile,
    themeMode,
  ]);

  // Asset preview (image/PDF)
  useEffect(() => {
    let cancelled = false;

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    parsedContent,
    enhancedBodyHtml,
    sanitizedHtmlPreview,
    assetPreviewSrc,
    requiresAsyncEnhancement,
  };
}
