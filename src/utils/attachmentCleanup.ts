import type { FileNode } from '../types';
import { getFileSystem } from '../types/filesystem';
import { createAttachmentResolverContext, resolveAttachmentTarget } from './attachmentResolver';
import { joinFsPath, normalizeSlashes, sanitizeResourceFolder } from './pathHelpers';
import { parseWikiLinkReference } from './wikiLinks';

interface FindUnusedAttachmentsOptions {
  files: FileNode[];
  rootFolderPath: string;
  resourceFolder: string;
  fileContentOverrides?: Record<string, string | undefined>;
}

export interface UnusedAttachmentScanResult {
  resourceRootPath: string;
  resourceFolderName: string;
  attachmentFiles: FileNode[];
  unusedAttachments: FileNode[];
}

const WIKI_LINK_REGEX = /!?\[\[([^[\]]+)\]\]/g;
const MARKDOWN_LINK_REGEX = /!?\[[^\]]*]\((<[^>\n]+>|[^)\n]+)\)/g;
const HTML_ATTACHMENT_REGEX = /<(?:img|audio|video|source|a)\b[^>]+(?:src|href)=["']([^"']+)["']/gi;


function flattenFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => (
    node.type === 'folder'
      ? flattenFiles(node.children ?? [])
      : (node.isTrash ? [] : [node])
  ));
}

function isMarkdownFile(node: FileNode): boolean {
  return /\.(md|markdown)$/i.test(node.name);
}

function isInsideFolder(path: string, folderPath: string): boolean {
  const normalizedPath = normalizeSlashes(path);
  const normalizedFolderPath = normalizeSlashes(folderPath);
  return normalizedPath === normalizedFolderPath || normalizedPath.startsWith(`${normalizedFolderPath}/`);
}

function stripMarkdownDestination(rawDestination: string): string | null {
  const trimmed = rawDestination.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim() || null;
  }

  const titleMatch = trimmed.match(/^(\S+)\s+(?:"[^"]*"|'[^']*')\s*$/);
  return titleMatch?.[1] ?? trimmed;
}

function extractAttachmentTargets(content: string): string[] {
  const targets = new Set<string>();

  for (const match of content.matchAll(WIKI_LINK_REGEX)) {
    const rawReference = match[1]?.trim();
    if (!rawReference) continue;

    const parsed = parseWikiLinkReference(rawReference, { embed: true });
    if (parsed.target) {
      targets.add(parsed.target);
    }
  }

  for (const match of content.matchAll(MARKDOWN_LINK_REGEX)) {
    const target = stripMarkdownDestination(match[1] ?? '');
    if (target) {
      targets.add(target);
    }
  }

  for (const match of content.matchAll(HTML_ATTACHMENT_REGEX)) {
    const target = match[1]?.trim();
    if (target) {
      targets.add(target);
    }
  }

  return Array.from(targets);
}

export async function findUnusedAttachments(
  options: FindUnusedAttachmentsOptions
): Promise<UnusedAttachmentScanResult> {
  const {
    files,
    rootFolderPath,
    resourceFolder,
    fileContentOverrides = {},
  } = options;
  const resourceFolderName = sanitizeResourceFolder(resourceFolder) || 'resources';
  const resourceRootPath = joinFsPath(rootFolderPath, resourceFolderName);
  const normalizedResourceRootPath = normalizeSlashes(resourceRootPath);
  const fs = await getFileSystem();

  let attachmentFiles: FileNode[] = [];

  try {
    attachmentFiles = flattenFiles(await fs.readDirectory(resourceRootPath, rootFolderPath));
  } catch {
    return {
      resourceRootPath,
      resourceFolderName,
      attachmentFiles: [],
      unusedAttachments: [],
    };
  }

  if (attachmentFiles.length === 0) {
    return {
      resourceRootPath,
      resourceFolderName,
      attachmentFiles: [],
      unusedAttachments: [],
    };
  }

  const markdownFiles = flattenFiles(files).filter(isMarkdownFile);
  const usedAttachmentPaths = new Set<string>();

  for (const file of markdownFiles) {
    let content = fileContentOverrides[file.path] ?? fileContentOverrides[file.id];

    if (content === undefined) {
      try {
        content = await fs.readFile(file.path);
      } catch {
        continue;
      }
    }

    const targets = extractAttachmentTargets(content);
    if (targets.length === 0) continue;

    const resolverContext = createAttachmentResolverContext(files, rootFolderPath, file.path);

    for (const target of targets) {
      const resolved = await resolveAttachmentTarget(resolverContext, target);
      if (!resolved) continue;

      const normalizedResolvedPath = normalizeSlashes(resolved.path);
      if (isInsideFolder(normalizedResolvedPath, normalizedResourceRootPath)) {
        usedAttachmentPaths.add(normalizedResolvedPath);
      }
    }
  }

  return {
    resourceRootPath,
    resourceFolderName,
    attachmentFiles,
    unusedAttachments: attachmentFiles.filter((file) => !usedAttachmentPaths.has(normalizeSlashes(file.path))),
  };
}
