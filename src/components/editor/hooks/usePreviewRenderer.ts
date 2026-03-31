/**
 * Preview Renderer Hook
 * 
 * 处理预览面板的渲染逻辑：
 * - Markdown 渲染
 * - HTML 增强（图片、嵌入）
 * - 资源解析
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { parseFrontmatter } from '../../../utils/frontmatter';
import { renderMarkdown, useMarkdownRenderer } from '../../../utils/markdown';
import { renderMermaidDiagrams } from '../../../utils/markdown-extensions';
import { hydrateCachedPreviewImageSources, resolvePreviewSource, warmPreviewImage } from '../../../utils/previewImageCache';
import { parseWikiLinkReference, extractWikiNoteFragment } from '../../../utils/wikiLinks';
import { createAttachmentResolverContext, resolveAttachmentTarget } from '../../../utils/attachmentResolver';
import type { FileNode } from '../../../types';

export interface UsePreviewRendererOptions {
  content: string;
  currentFilePath?: string | null;
  isMarkdownPreview: boolean;
  isHtmlPreview: boolean;
  highlighter?: any;
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
  
  // 刷新 Mermaid
  refreshMermaid: () => void;
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

function isHtmlDocument(fileName: string): boolean {
  return /\.html?$/i.test(fileName);
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
  useMarkdownRenderer(highlighter, themeMode);

  const [enhancedBodyHtml, setEnhancedBodyHtml] = useState('');
  const [assetPreviewSrc, setAssetPreviewSrc] = useState('');
  const mermaidTimerRef = useRef<number | null>(null);

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

  // Attachment resolver context
  const attachmentResolverContext = useMemo(
    () => createAttachmentResolverContext(files, rootFolderPath, currentFilePath),
    [files, rootFolderPath, currentFilePath]
  );

  // Enhance HTML with embeds and images
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
      try {
        const parsed = new DOMParser().parseFromString(baseHtml, 'text/html');
        const embeds = isMarkdownPreview
          ? Array.from(parsed.body.querySelectorAll<HTMLElement>('[data-wiki-embed="true"], a.markdown-embed'))
          : [];
        const markdownImages = Array.from(parsed.body.querySelectorAll<HTMLImageElement>('img'));

        // Process images
        await Promise.all(markdownImages.map(async (image) => {
          try {
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
      } catch (error) {
        console.warn('Failed to process image:', error);
      }
      }));

      if (embeds.length === 0) {
        if (!cancelled) {
          setEnhancedBodyHtml(parsed.body.innerHTML);
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
            image.setAttribute('data-original-src', resolvedTarget.path);
            if (embedWidth) image.style.width = `${embedWidth}px`;
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
        setEnhancedBodyHtml(parsed.body.innerHTML);
      }
    } catch (error) {
      console.error('Preview renderer error:', error);
      // Keep the base HTML on error
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
    parsedContent.bodyHTML,
    readFile,
    sanitizedHtmlPreview,
    themeMode,
  ]);

  // Asset preview (image/PDF)
  useEffect(() => {
    let cancelled = false;

    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh Mermaid
  const refreshMermaid = useCallback(() => {
    if (mermaidTimerRef.current) {
      clearTimeout(mermaidTimerRef.current);
    }
    mermaidTimerRef.current = window.setTimeout(() => {
      renderMermaidDiagrams(document.body);
    }, 50);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mermaidTimerRef.current) {
        clearTimeout(mermaidTimerRef.current);
      }
    };
  }, []);

  return {
    parsedContent,
    enhancedBodyHtml,
    sanitizedHtmlPreview,
    assetPreviewSrc,
    refreshMermaid,
  };
}
