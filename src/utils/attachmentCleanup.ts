import type { FileNode } from '../types';
import { getFileSystem } from '../types/filesystem';
import { createAttachmentResolverContext, resolveAttachmentTarget } from './attachmentResolver';
import { extractAttachmentTargets, flattenFiles, isMarkdownFile } from './markdownLinkUtils';
import { joinFsPath, normalizeSlashes, sanitizeResourceFolder } from './pathHelpers';

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

function isInsideFolder(path: string, folderPath: string): boolean {
  const normalizedPath = normalizeSlashes(path);
  const normalizedFolderPath = normalizeSlashes(folderPath);
  return normalizedPath === normalizedFolderPath || normalizedPath.startsWith(`${normalizedFolderPath}/`);
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
