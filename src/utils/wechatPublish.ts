import { createAttachmentResolverContext, resolveAttachmentTarget } from './attachmentResolver';
import { parseFrontmatter } from './frontmatter';
import { renderMarkdown } from './markdown';
import { getResolvedCodeFontFamily, getResolvedPreviewFontFamily } from './fontSettings';
import { getPathBasename } from '../app/appShellUtils';
import type { AppSettings, FileNode, Frontmatter } from '../types';

export interface WechatDraftDefaults {
  title: string;
  author: string;
  digest: string;
  contentSourceUrl: string;
  showCoverPic: boolean;
  existingDraftMediaId: string;
}

export interface WechatDraftPublishInput {
  title: string;
  author: string;
  digest: string;
  contentSourceUrl: string;
  showCoverPic: boolean;
  coverImagePath: string;
  existingDraftMediaId?: string | null;
}

export interface WechatImageAsset {
  placeholder: string;
  sourcePath?: string;
  sourceUrl?: string;
}

export interface PreparedWechatDraftPublish {
  contentHtml: string;
  imageAssets: WechatImageAsset[];
  unresolvedImages: string[];
}

interface PrepareWechatDraftPublishOptions {
  files: FileNode[];
  rootFolderPath?: string | null;
  currentFilePath: string;
  markdownContent: string;
  settings: Pick<AppSettings, 'previewFontFamily' | 'codeFontFamily' | 'fontSize'>;
}

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

function stripMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown)$/i, '');
}

function resolveTitle(frontmatter: Frontmatter | null, currentFilePath: string): string {
  const title = typeof frontmatter?.title === 'string' ? frontmatter.title.trim() : '';
  if (title) {
    return title;
  }

  return stripMarkdownExtension(getPathBasename(currentFilePath)) || 'Untitled';
}

function resolveDigest(frontmatter: Frontmatter | null, body: string): string {
  const frontmatterDigest = typeof frontmatter?.digest === 'string'
    ? frontmatter.digest.trim()
    : typeof frontmatter?.description === 'string'
      ? frontmatter.description.trim()
      : '';

  if (frontmatterDigest) {
    return frontmatterDigest;
  }

  const plainText = body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '$1')
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    .replace(/\[\[[^\]]+\]\]/g, ' ')
    .replace(/[*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return plainText.slice(0, 120);
}

export function extractWechatDraftDefaults(markdownContent: string, currentFilePath: string): WechatDraftDefaults {
  const { frontmatter, body } = parseFrontmatter(markdownContent);

  return {
    title: resolveTitle(frontmatter, currentFilePath),
    author: typeof frontmatter?.author === 'string' ? frontmatter.author.trim() : '',
    digest: resolveDigest(frontmatter, body),
    contentSourceUrl: typeof frontmatter?.content_source_url === 'string'
      ? frontmatter.content_source_url.trim()
      : '',
    showCoverPic: frontmatter?.show_cover_pic === false ? false : true,
    existingDraftMediaId: typeof frontmatter?.wechat_draft_media_id === 'string'
      ? frontmatter.wechat_draft_media_id.trim()
      : '',
  };
}

function isRemoteImageSource(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value) || value.startsWith('//');
}

function isImagePath(value: string): boolean {
  return IMAGE_FILE_PATTERN.test(value);
}

function setInlineStyle(element: HTMLElement, styles: Record<string, string | null | undefined>): void {
  Object.entries(styles).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      element.style.removeProperty(key);
      return;
    }
    element.style.setProperty(key, value);
  });
}

function applyWechatPreviewStyles(
  host: HTMLDivElement,
  settings: Pick<AppSettings, 'previewFontFamily' | 'codeFontFamily' | 'fontSize'>,
): void {
  const previewFontFamily = getResolvedPreviewFontFamily(settings);
  const codeFontFamily = getResolvedCodeFontFamily(settings);
  const previewFontSize = `${settings.fontSize}px`;
  const codeFontSize = `${Math.max(12, settings.fontSize - 2)}px`;

  setInlineStyle(host, {
    'font-family': previewFontFamily,
    'font-size': previewFontSize,
    'line-height': '1.95',
    color: '#1f2937',
    'overflow-wrap': 'anywhere',
    'word-break': 'break-word',
  });

  const blockElements = Array.from(host.querySelectorAll<HTMLElement>('p, ul, ol, blockquote, pre, table, hr'));
  blockElements.forEach((element) => {
    if (!element.style.marginTop) element.style.marginTop = '1em';
    if (!element.style.marginBottom) element.style.marginBottom = '1em';
  });

  host.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const headingLevel = Number(heading.tagName.slice(1));
    const fontSizes = ['2.1em', '1.7em', '1.4em', '1.18em', '1em', '0.92em'];
    setInlineStyle(heading, {
      color: '#7c3aed',
      'letter-spacing': '0.01em',
      'font-weight': '700',
      'line-height': '1.35',
      'margin-top': headingLevel === 1 ? '1.1em' : '1em',
      'margin-bottom': '0.55em',
      'font-size': fontSizes[headingLevel - 1] ?? '1em',
    });

    if (headingLevel === 2) {
      setInlineStyle(heading, {
        'padding-bottom': '0.3em',
        'border-bottom': '1px solid rgba(124, 58, 237, 0.18)',
      });
    }
  });

  host.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
    setInlineStyle(link, {
      color: '#0f9aa8',
      'text-decoration': 'underline',
      'text-decoration-thickness': '1.5px',
      'text-underline-offset': '0.12em',
    });
  });

  host.querySelectorAll<HTMLElement>('blockquote').forEach((blockquote) => {
    setInlineStyle(blockquote, {
      'border-left': '4px solid rgba(124, 58, 237, 0.28)',
      color: '#5b21b6',
      background: 'rgba(124, 58, 237, 0.04)',
      'border-radius': '0 14px 14px 0',
      padding: '0.9rem 1rem',
      margin: '1rem 0',
    });
  });

  host.querySelectorAll<HTMLElement>('code').forEach((code) => {
    const parentPre = code.closest('pre');
    if (parentPre) {
      setInlineStyle(code, {
        background: 'transparent',
        padding: '0',
        'border-radius': '0',
        'font-family': codeFontFamily,
        'font-size': codeFontSize,
        color: 'inherit',
      });
      return;
    }

    setInlineStyle(code, {
      background: 'rgba(15, 23, 42, 0.06)',
      'border-radius': '0.45rem',
      padding: '0.15rem 0.35rem',
      'font-family': codeFontFamily,
      'font-size': codeFontSize,
      color: '#1f2937',
    });
  });

  host.querySelectorAll<HTMLElement>('pre').forEach((pre) => {
    setInlineStyle(pre, {
      background: 'rgba(248, 250, 252, 0.96)',
      color: '#1f2937',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      'border-radius': '1rem',
      padding: '1rem 1.1rem',
      overflow: 'auto',
      'max-width': '100%',
      'box-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.55)',
      'line-height': '1.75',
      margin: '1rem 0',
    });
  });

  host.querySelectorAll<HTMLElement>('table').forEach((table) => {
    setInlineStyle(table, {
      width: '100%',
      'max-width': '100%',
      'border-collapse': 'collapse',
      color: '#1f2937',
      margin: '1rem 0',
      'font-size': '0.95em',
    });
  });

  host.querySelectorAll<HTMLElement>('thead tr').forEach((row) => {
    setInlineStyle(row, {
      background: 'rgba(241, 245, 249, 0.96)',
    });
  });

  host.querySelectorAll<HTMLElement>('tbody tr').forEach((row, index) => {
    setInlineStyle(row, {
      background: index % 2 === 0 ? 'rgba(255, 255, 255, 0.92)' : 'rgba(248, 250, 252, 0.96)',
      'border-top': '1px solid rgba(148, 163, 184, 0.26)',
    });
  });

  host.querySelectorAll<HTMLElement>('th').forEach((cell) => {
    setInlineStyle(cell, {
      background: 'rgba(241, 245, 249, 0.96)',
      color: '#334155',
      'font-weight': '600',
      border: '1px solid rgba(148, 163, 184, 0.26)',
      padding: '0.55rem 0.75rem',
      'text-align': 'left',
    });
  });

  host.querySelectorAll<HTMLElement>('td').forEach((cell) => {
    setInlineStyle(cell, {
      border: '1px solid rgba(148, 163, 184, 0.26)',
      padding: '0.55rem 0.75rem',
    });
  });

  host.querySelectorAll<HTMLElement>('ul, ol').forEach((list) => {
    setInlineStyle(list, {
      'padding-left': '2rem',
      margin: '0.5rem 0',
    });
  });

  host.querySelectorAll<HTMLElement>('li').forEach((listItem) => {
    setInlineStyle(listItem, {
      'margin-top': '0.2rem',
      'margin-bottom': '0.2rem',
    });
  });

  host.querySelectorAll<HTMLHRElement>('hr').forEach((rule) => {
    setInlineStyle(rule, {
      border: 'none',
      'border-top': '1px solid rgba(124, 58, 237, 0.18)',
      margin: '1.5rem 0',
    });
  });

  host.querySelectorAll<HTMLElement>('img').forEach((image) => {
    setInlineStyle(image, {
      display: 'block',
      'max-width': '100%',
      height: 'auto',
      margin: '1rem auto',
      'border-radius': '1rem',
      'box-shadow': '0 16px 40px rgba(15, 23, 42, 0.08)',
    });
  });
}

export async function prepareWechatDraftPublish(
  options: PrepareWechatDraftPublishOptions
): Promise<PreparedWechatDraftPublish> {
  const { files, rootFolderPath, currentFilePath, markdownContent, settings } = options;

  if (typeof document === 'undefined') {
    throw new Error('WeChat publish preparation requires a browser environment.');
  }

  const { body } = parseFrontmatter(markdownContent);
  const renderedHtml = renderMarkdown(body, { themeMode: 'light' });
  const host = document.createElement('div');
  host.innerHTML = renderedHtml;

  const attachmentResolverContext = createAttachmentResolverContext(files, rootFolderPath, currentFilePath);
  const imageAssets: WechatImageAsset[] = [];
  const unresolvedImages: string[] = [];
  const assetBySource = new Map<string, string>();
  let placeholderIndex = 0;

  const registerImageAsset = (asset: Omit<WechatImageAsset, 'placeholder'>) => {
    const assetKey = asset.sourcePath ? `path:${asset.sourcePath}` : `url:${asset.sourceUrl}`;
    const existingPlaceholder = assetBySource.get(assetKey);
    if (existingPlaceholder) {
      return existingPlaceholder;
    }

    placeholderIndex += 1;
    const placeholder = `__WECHAT_LOCAL_IMAGE_${placeholderIndex}__`;
    imageAssets.push({ placeholder, ...asset });
    assetBySource.set(assetKey, placeholder);
    return placeholder;
  };

  const wikiEmbeds = Array.from(host.querySelectorAll<HTMLAnchorElement>('a[data-wiki-embed="true"]'));
  for (const embed of wikiEmbeds) {
    const target = embed.getAttribute('data-wiki-target')?.trim() || embed.getAttribute('data-wikilink')?.trim() || '';
    if (!target) {
      unresolvedImages.push('');
      continue;
    }

    const resolved = await resolveAttachmentTarget(attachmentResolverContext, target);
    if (!resolved || !isImagePath(resolved.name)) {
      unresolvedImages.push(target);
      continue;
    }

    const image = document.createElement('img');
    image.setAttribute('alt', embed.getAttribute('data-wiki-label')?.trim() || resolved.name);
    image.setAttribute('src', registerImageAsset({ sourcePath: resolved.path }));
    embed.replaceWith(image);
  }

  const images = Array.from(host.querySelectorAll<HTMLImageElement>('img'));
  for (const image of images) {
    const src = image.getAttribute('src')?.trim() || '';
    if (!src || src.startsWith('__WECHAT_LOCAL_IMAGE_')) {
      continue;
    }

    if (src.startsWith('data:')) {
      continue;
    }

    if (isRemoteImageSource(src)) {
      image.setAttribute('src', registerImageAsset({ sourceUrl: src }));
      continue;
    }

    const resolved = await resolveAttachmentTarget(attachmentResolverContext, src);
    if (!resolved || !isImagePath(resolved.name)) {
      unresolvedImages.push(src);
      continue;
    }

    image.setAttribute('src', registerImageAsset({ sourcePath: resolved.path }));
  }

  applyWechatPreviewStyles(host, settings);

  return {
    contentHtml: host.outerHTML,
    imageAssets,
    unresolvedImages,
  };
}
