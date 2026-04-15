import { readFile } from '@tauri-apps/plugin-fs';
import { createAttachmentResolverContext, resolveAttachmentTarget } from './attachmentResolver';
import { generateFrontmatter, parseFrontmatter } from './frontmatter';
import { parseWikiLinkReference } from './wikiLinks';
import { uploadImageToHosting } from '../services/imageHostingService';
import type { AppSettings, FileNode, Frontmatter } from '../types';

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)\n]+)\)/g;
const WIKI_EMBED_REGEX = /!\[\[([^\]\n]+)\]\]/g;

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

function isLikelyRasterOrVectorImagePath(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|heic|tiff?)$/i.test(filePath);
}

function rebuildMarkdown(frontmatter: Frontmatter | null, body: string): string {
  if (!frontmatter) {
    return body;
  }
  const header = generateFrontmatter(frontmatter);
  return header ? header + body : body;
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

export interface PublishLocalImagesOptions {
  files: FileNode[];
  rootFolderPath?: string | null;
  currentFilePath: string;
  settings: AppSettings;
}

export type PublishLocalImagesResult =
  | { ok: true; markdown: string; uploadedCount: number }
  | { ok: false; reason: 'hosting_not_configured' }
  | { ok: false; reason: 'upload_failed'; message: string };

/**
 * Before simple-blog publish: upload local image attachments to the configured image host
 * and rewrite markdown to remote URLs. Non-image local files are left unchanged for the
 * existing repo-asset pipeline.
 */
export async function replaceLocalImagesWithHostingForPublish(
  markdownContent: string,
  options: PublishLocalImagesOptions
): Promise<PublishLocalImagesResult> {
  const { files, rootFolderPath, currentFilePath, settings } = options;
  const { frontmatter, body } = parseFrontmatter(markdownContent);

  const resolverContext = createAttachmentResolverContext(files, rootFolderPath, currentFilePath);
  const pathToUrl = new Map<string, string>();

  const collectNeedsHosting = async (): Promise<boolean> => {
    let needs = false;

    for (const match of body.matchAll(WIKI_EMBED_REGEX)) {
      const reference = parseWikiLinkReference(match[1], { embed: true });
      if (!reference.target || isRemoteTarget(reference.target)) continue;
      const resolved = await resolveAttachmentTarget(resolverContext, reference.target);
      if (resolved && isLikelyRasterOrVectorImagePath(resolved.path)) {
        needs = true;
        return true;
      }
    }

    for (const match of body.matchAll(MARKDOWN_IMAGE_REGEX)) {
      const target = decodeMarkdownDestination(match[2]);
      if (!target || isRemoteTarget(target)) continue;
      const resolved = await resolveAttachmentTarget(resolverContext, target);
      if (resolved && isLikelyRasterOrVectorImagePath(resolved.path)) {
        needs = true;
        return true;
      }
    }

    return needs;
  };

  if (!(await collectNeedsHosting())) {
    return { ok: true, markdown: markdownContent, uploadedCount: 0 };
  }

  if (!settings.imageHosting?.provider || settings.imageHosting.provider === 'none') {
    return { ok: false, reason: 'hosting_not_configured' };
  }

  let uploadedCount = 0;

  const ensureUploaded = async (sourcePath: string, filename: string): Promise<string> => {
    const cached = pathToUrl.get(sourcePath);
    if (cached) return cached;

    const bytes = await readFile(sourcePath);
    const result = await uploadImageToHosting(bytes.buffer as ArrayBuffer, filename, settings);
    pathToUrl.set(sourcePath, result.url);
    uploadedCount += 1;
    return result.url;
  };

  try {
    let transformedBody = await replaceAsync(body, WIKI_EMBED_REGEX, async (match) => {
      const reference = parseWikiLinkReference(match[1], { embed: true });
      if (!reference.target || isRemoteTarget(reference.target)) {
        return match[0];
      }

      const resolved = await resolveAttachmentTarget(resolverContext, reference.target);
      if (!resolved || !isLikelyRasterOrVectorImagePath(resolved.path)) {
        return match[0];
      }

      const url = await ensureUploaded(resolved.path, resolved.name);
      const altText = reference.displayText || resolved.name;
      return `![${altText}](${url})`;
    });

    transformedBody = await replaceAsync(transformedBody, MARKDOWN_IMAGE_REGEX, async (match) => {
      const altText = match[1] || '';
      const target = decodeMarkdownDestination(match[2]);
      if (!target || isRemoteTarget(target)) {
        return match[0];
      }

      const resolved = await resolveAttachmentTarget(resolverContext, target);
      if (!resolved || !isLikelyRasterOrVectorImagePath(resolved.path)) {
        return match[0];
      }

      const url = await ensureUploaded(resolved.path, resolved.name);
      return `![${altText}](${url})`;
    });

    return {
      ok: true,
      markdown: rebuildMarkdown(frontmatter, transformedBody),
      uploadedCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'upload_failed', message };
  }
}
