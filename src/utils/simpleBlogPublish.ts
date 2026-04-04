import { createAttachmentResolverContext, resolveAttachmentTarget } from './attachmentResolver';
import { generateFrontmatter, parseFrontmatter } from './frontmatter';
import { normalizeBlogSiteUrl } from './blogRepo';
import { parseWikiLinkReference } from './wikiLinks';
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
}

interface PrepareSimpleBlogPublishOptions {
  files: FileNode[];
  rootFolderPath?: string | null;
  currentFilePath: string;
  markdownContent: string;
}

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
const WIKI_EMBED_REGEX = /!\[\[([^\]\n]+)\]\]/g;

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

function isAsciiAliasCandidate(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(value);
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

function ensurePublishedFrontmatter(markdownContent: string): {
  frontmatter: Frontmatter;
  body: string;
  content: string;
} {
  const { frontmatter, body } = parseFrontmatter(markdownContent);
  const nextFrontmatter: Frontmatter = {
    ...(frontmatter || {}),
    is_publish: true,
  };

  return {
    frontmatter: nextFrontmatter,
    body,
    content: `${generateFrontmatter(nextFrontmatter)}${body}`,
  };
}

export function resolveSimpleBlogPostSlug(markdownContent: string, postRelativePath: string): string {
  const { frontmatter } = parseFrontmatter(markdownContent);
  const slug = typeof frontmatter?.slug === 'string'
    ? normalizeSlugCandidate(frontmatter.slug)
    : '';

  if (slug) {
    return slug;
  }

  const asciiAlias = extractAliasCandidates(frontmatter).find(isAsciiAliasCandidate);
  if (asciiAlias) {
    return asciiAlias;
  }

  return stripExtension(getPathBasename(postRelativePath)) || 'published-post';
}

export function resolveSimpleBlogLinkSlug(markdownContent: string, postRelativePath: string): string {
  const { frontmatter } = parseFrontmatter(markdownContent);
  const aliases = extractAliasCandidates(frontmatter);
  const englishAlias = aliases.find(isAsciiAliasCandidate);
  if (englishAlias) {
    return englishAlias;
  }

  const fallbackAlias = aliases[0];
  if (fallbackAlias) {
    return fallbackAlias;
  }

  return resolveSimpleBlogPostSlug(markdownContent, postRelativePath);
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
  const { currentFilePath, files, markdownContent, rootFolderPath } = options;
  const published = ensurePublishedFrontmatter(markdownContent);
  const currentFileName = getPathBasename(currentFilePath);
  const baseName = stripExtension(currentFileName) || 'published-post';
  const assetDirectoryRelativePath = `resource/${sanitizeAssetDirectoryName(baseName)}`;
  const postRelativePath = `posts/${baseName || 'published-post'}.md`;

  const resolverContext = createAttachmentResolverContext(files, rootFolderPath, currentFilePath);
  const assetMap = new Map<string, SimpleBlogPublishAsset>();
  let assetCounter = 0;

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
      return match[0];
    }

    const asset = registerAsset(resolved.path, resolved.name);
    const altText = reference.displayText || resolved.name;
    return `![${altText}](/${asset.targetRelativePath})`;
  });

  transformedBody = await replaceAsync(transformedBody, MARKDOWN_IMAGE_REGEX, async (match) => {
    const altText = match[1] || '';
    const target = decodeMarkdownDestination(match[2]);
    if (!target || isRemoteTarget(target)) {
      return match[0];
    }

    const resolved = await resolveAttachmentTarget(resolverContext, target);
    if (!resolved) {
      return match[0];
    }

    const asset = registerAsset(resolved.path, resolved.name);
    return `![${altText}](/${asset.targetRelativePath})`;
  });

  return {
    markdownContent: `${generateFrontmatter(published.frontmatter)}${transformedBody}`,
    postRelativePath,
    assetDirectoryRelativePath,
    assets: Array.from(assetMap.values()),
  };
}
