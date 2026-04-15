import { createAttachmentResolverContext, resolveAttachmentTarget } from './attachmentResolver';
import { generateFrontmatter, parseFrontmatter } from './frontmatter';
import { normalizeBlogSiteUrl } from './blogRepo';
import { createHeadingSlug } from './outline';
import { parseWikiLinkReference, resolveWikiLinkFile } from './wikiLinks';
import { getFileSystem } from '../types/filesystem';
import type { FileNode, Frontmatter } from '../types';

export interface SimpleBlogPublishAsset {
  sourcePath: string;
  targetRelativePath: string;
}

export interface PreparedSimpleBlogPublish {
  markdownContent: string;
  postRelativePath: string;
  assetDirectoryRelativePath: string;
  assets: SimpleBlogPublishAsset[];
  unresolvedImages: string[];
}

interface PrepareSimpleBlogPublishOptions {
  files: FileNode[];
  blogSiteUrl?: string | null;
  rootFolderPath?: string | null;
  currentFilePath: string;
  markdownContent: string;
}

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
const WIKI_EMBED_REGEX = /!\[\[([^\]\n]+)\]\]/g;
const WIKI_LINK_REGEX = /(^|[^!])\[\[([^\]\n]+)\]\]/gm;

function getPathBasename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || path;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown)$/i, '');
}

function normalizeSlugCandidate(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

function normalizeLinkSlugCandidate(value: string): string {
  return normalizeSlugCandidate(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"]/g, '')
    .replace(/[^A-Za-z0-9/_ -]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function extractAliasCandidates(frontmatter: Frontmatter | null): string[] {
  const aliases = frontmatter?.aliases;
  if (typeof aliases === 'string') {
    const normalized = normalizeSlugCandidate(aliases);
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(aliases)) {
    return aliases
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normalizeSlugCandidate(item))
      .filter(Boolean);
  }

  return [];
}

function encodeUrlPath(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sanitizeAssetDirectoryName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const hash = Array.from(value).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 7)
    .toString(16)
    .slice(0, 8);

  return normalized ? `${normalized}-${hash}` : `post-assets-${hash}`;
}

function sanitizeAssetFileName(fileName: string): string {
  const sanitized = fileName
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || 'asset';
}

function isMarkdownFilePath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

function isRemoteTarget(target: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(target) || target.startsWith('//');
}

function decodeMarkdownDestination(rawDestination: string): string {
  const trimmed = rawDestination.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('<')) {
    const closingIndex = trimmed.indexOf('>');
    if (closingIndex > 0) {
      return trimmed.slice(1, closingIndex).trim();
    }
  }

  const titleSeparated = trimmed.match(/^(.+?)(?:\s+(?:"[^"]*"|'[^']*'))?$/);
  return (titleSeparated?.[1] || trimmed).trim();
}

function escapeMarkdownLinkLabel(value: string): string {
  return value.replace(/([\\[\]])/g, '\\$1');
}

function buildSimpleBlogPostRelativePath(filePath: string): string {
  return `posts/${stripExtension(getPathBasename(filePath)) || 'published-post'}.md`;
}

function normalizePublishedLink(
  rawLink: string,
  blogSiteUrl: string | null | undefined
): string | null {
  const trimmed = rawLink.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('/')) {
    const normalizedSiteUrl = normalizeBlogSiteUrl(blogSiteUrl ?? '');
    if (!normalizedSiteUrl) {
      return null;
    }

    try {
      return new URL(trimmed, `${normalizedSiteUrl}/`).toString();
    } catch {
      return null;
    }
  }

  return null;
}

function resolvePublishedNoteUrl(
  blogSiteUrl: string | null | undefined,
  markdownContent: string,
  filePath: string
): string | null {
  const { frontmatter } = parseFrontmatter(markdownContent);
  const explicitLink = typeof frontmatter?.link === 'string'
    ? normalizePublishedLink(frontmatter.link, blogSiteUrl)
    : null;

  if (explicitLink) {
    return explicitLink;
  }

  if (frontmatter?.is_publish !== true) {
    return null;
  }

  return buildSimpleBlogPostUrl(
    blogSiteUrl ?? '',
    markdownContent,
    buildSimpleBlogPostRelativePath(filePath)
  );
}

function appendWikiLinkFragment(url: string, reference: ReturnType<typeof parseWikiLinkReference>): string {
  if (!reference.subpath.trim()) {
    return url;
  }

  if (reference.subpathType !== 'heading') {
    return url;
  }

  const headingSlug = createHeadingSlug(reference.subpath);
  if (!headingSlug) {
    return url;
  }

  return `${url}#${encodeURIComponent(headingSlug)}`;
}

async function replaceAsync(
  input: string,
  regex: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>
): Promise<string> {
  let output = '';
  let lastIndex = 0;

  for (const match of input.matchAll(regex)) {
    const fullMatch = match[0];
    const index = match.index ?? 0;
    output += input.slice(lastIndex, index);
    output += await replacer(match as RegExpExecArray);
    lastIndex = index + fullMatch.length;
  }

  output += input.slice(lastIndex);
  return output;
}

function resolveSimpleBlogTitle(markdownContent: string, currentFilePath: string): string {
  const { frontmatter } = parseFrontmatter(markdownContent);
  const title = typeof frontmatter?.title === 'string'
    ? frontmatter.title.trim()
    : '';

  if (title) {
    return title;
  }

  return stripExtension(getPathBasename(currentFilePath)) || 'published-post';
}

function resolveSimpleBlogAliases(markdownContent: string, currentFilePath: string): string | string[] {
  const { frontmatter } = parseFrontmatter(markdownContent);
  const aliases = extractAliasCandidates(frontmatter);
  if (aliases.length > 0) {
    return Array.isArray(frontmatter?.aliases) ? aliases : aliases[0];
  }

  return resolveSimpleBlogTitle(markdownContent, currentFilePath);
}

function resolveSimpleBlogPublishSlug(markdownContent: string, currentFilePath: string): string {
  const { frontmatter } = parseFrontmatter(markdownContent);
  const slug = typeof frontmatter?.slug === 'string'
    ? normalizeSlugCandidate(frontmatter.slug)
    : '';

  if (slug) {
    return slug;
  }

  return normalizeLinkSlugCandidate(resolveSimpleBlogTitle(markdownContent, currentFilePath))
    || stripExtension(getPathBasename(currentFilePath))
    || 'published-post';
}

function ensurePublishedFrontmatter(markdownContent: string, currentFilePath: string): {
  frontmatter: Frontmatter;
  body: string;
  content: string;
} {
  const { frontmatter, body } = parseFrontmatter(markdownContent);
  const resolvedTitle = resolveSimpleBlogTitle(markdownContent, currentFilePath);
  const resolvedAliases = resolveSimpleBlogAliases(markdownContent, currentFilePath);
  const resolvedSlug = resolveSimpleBlogPublishSlug(markdownContent, currentFilePath);
  const nextFrontmatter: Frontmatter = {
    ...(frontmatter || {}),
    title: resolvedTitle,
    aliases: resolvedAliases,
    slug: resolvedSlug,
    is_publish: true,
  };

  return {
    frontmatter: nextFrontmatter,
    body,
    content: `${generateFrontmatter(nextFrontmatter)}${body}`,
  };
}

export function resolveSimpleBlogPostSlug(markdownContent: string, postRelativePath: string): string {
  return stripExtension(getPathBasename(postRelativePath)) || 'published-post';
}

export function resolveSimpleBlogLinkSlug(markdownContent: string, postRelativePath: string): string {
  return resolveSimpleBlogPublishSlug(markdownContent, postRelativePath);
}

export function buildSimpleBlogPostUrl(
  blogSiteUrl: string,
  markdownContent: string,
  postRelativePath: string
): string | null {
  const normalizedSiteUrl = normalizeBlogSiteUrl(blogSiteUrl);
  if (!normalizedSiteUrl) {
    return null;
  }

  const slug = resolveSimpleBlogLinkSlug(markdownContent, postRelativePath);
  if (!slug) {
    return null;
  }

  const encodedSlugPath = encodeUrlPath(slug);
  return encodedSlugPath ? `${normalizedSiteUrl}/posts/${encodedSlugPath}/` : null;
}

export async function prepareSimpleBlogPublish(
  options: PrepareSimpleBlogPublishOptions
): Promise<PreparedSimpleBlogPublish> {
  const { blogSiteUrl, currentFilePath, files, markdownContent, rootFolderPath } = options;
  const published = ensurePublishedFrontmatter(markdownContent, currentFilePath);
  const currentFileName = getPathBasename(currentFilePath);
  const baseName = stripExtension(currentFileName) || 'published-post';
  const assetDirectoryRelativePath = `resource/${sanitizeAssetDirectoryName(baseName)}`;
  const postRelativePath = `posts/${baseName}.md`;

  const resolverContext = createAttachmentResolverContext(files, rootFolderPath, currentFilePath);
  const assetMap = new Map<string, SimpleBlogPublishAsset>();
  const markdownFileContentCache = new Map<string, Promise<string | null>>();
  const unresolvedImages: string[] = [];
  let assetCounter = 0;

  const readMarkdownFileContent = async (file: FileNode): Promise<string | null> => {
    if (!isMarkdownFilePath(file.path)) {
      return null;
    }

    const cached = markdownFileContentCache.get(file.path);
    if (cached) {
      return cached;
    }

    const pending = (async () => {
      if (typeof file.content === 'string' && file.content.length > 0) {
        return file.content;
      }

      try {
        const fs = await getFileSystem();
        return await fs.readFile(file.path);
      } catch (error) {
        console.error('Failed to read wiki link target for publish:', file.path, error);
        return null;
      }
    })();

    markdownFileContentCache.set(file.path, pending);
    return pending;
  };

  const registerAsset = (sourcePath: string, originalName: string): SimpleBlogPublishAsset => {
    const existing = assetMap.get(sourcePath);
    if (existing) {
      return existing;
    }

    assetCounter += 1;
    const targetFileName = `${String(assetCounter).padStart(2, '0')}-${sanitizeAssetFileName(originalName)}`;
    const asset = {
      sourcePath,
      targetRelativePath: `${assetDirectoryRelativePath}/${targetFileName}`,
    };

    assetMap.set(sourcePath, asset);
    return asset;
  };

  let transformedBody = await replaceAsync(published.body, WIKI_EMBED_REGEX, async (match) => {
    const reference = parseWikiLinkReference(match[1], { embed: true });
    if (!reference.target || isRemoteTarget(reference.target)) {
      return match[0];
    }

    const resolved = await resolveAttachmentTarget(resolverContext, reference.target);
    if (!resolved) {
      unresolvedImages.push(reference.target);
      return match[0];
    }

    const asset = registerAsset(resolved.path, resolved.name);
    const altText = reference.displayText || resolved.name;
    return `![${altText}](/${asset.targetRelativePath})`;
  });

  const alreadyRewrittenPrefix = `/${assetDirectoryRelativePath}/`;

  transformedBody = await replaceAsync(transformedBody, MARKDOWN_IMAGE_REGEX, async (match) => {
    const altText = match[1] || '';
    const target = decodeMarkdownDestination(match[2]);
    if (!target || isRemoteTarget(target)) {
      return match[0];
    }

    if (target.startsWith(alreadyRewrittenPrefix)) {
      return match[0];
    }

    const resolved = await resolveAttachmentTarget(resolverContext, target);
    if (!resolved) {
      unresolvedImages.push(target);
      return match[0];
    }

    const asset = registerAsset(resolved.path, resolved.name);
    return `![${altText}](/${asset.targetRelativePath})`;
  });

  transformedBody = await replaceAsync(transformedBody, WIKI_LINK_REGEX, async (match) => {
    const prefix = match[1] || '';
    const rawReference = match[2] || '';
    const reference = parseWikiLinkReference(rawReference);
    const label = escapeMarkdownLinkLabel(reference.displayText || reference.target);

    if (!reference.target.trim()) {
      return match[0];
    }

    if (!reference.path.trim()) {
      if (reference.subpathType !== 'heading') {
        return match[0];
      }

      const headingSlug = createHeadingSlug(reference.subpath);
      if (!headingSlug) {
        return match[0];
      }

      return `${prefix}[${label}](#${encodeURIComponent(headingSlug)})`;
    }

    const matchedFile = resolveWikiLinkFile(files, reference.target, rootFolderPath, currentFilePath);
    if (!matchedFile) {
      return match[0];
    }

    const targetContent = await readMarkdownFileContent(matchedFile);
    if (!targetContent) {
      return match[0];
    }

    const targetUrl = resolvePublishedNoteUrl(blogSiteUrl, targetContent, matchedFile.path);
    if (!targetUrl) {
      return match[0];
    }

    return `${prefix}[${label}](${appendWikiLinkFragment(targetUrl, reference)})`;
  });

  if (unresolvedImages.length > 0) {
    console.warn(
      `[publish] ${unresolvedImages.length} local image(s) could not be resolved and will be skipped:`,
      unresolvedImages,
    );
  }

  const assets = Array.from(assetMap.values());
  console.log(
    `[publish] prepared ${assets.length} asset(s) for publish`,
    assets.length > 0 ? assets.map((a) => a.targetRelativePath) : '(none)',
  );

  return {
    markdownContent: `${generateFrontmatter(published.frontmatter)}${transformedBody}`,
    postRelativePath,
    assetDirectoryRelativePath,
    assets,
    unresolvedImages,
  };
}
