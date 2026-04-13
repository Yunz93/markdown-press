import type { FileNode } from '../types';
import { getFileSystem } from '../types/filesystem';
import { resolveWikiLinkFile } from './wikiLinks';

export interface ResolvedAttachmentTarget {
  path: string;
  name: string;
}

export interface AttachmentResolverContext {
  cacheNamespace: string;
  currentFilePath?: string | null;
  rootFolderPath?: string | null;
  files: FileNode[];
}

const resolvedAttachmentCache = new Map<string, Promise<ResolvedAttachmentTarget | null>>();
const fileExistenceCache = new Map<string, Promise<boolean>>();

function hasUriScheme(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value) || value.startsWith('//');
}

function decodeLocalAttachmentTarget(rawTarget: string): string {
  const trimmedTarget = rawTarget.trim();
  if (!trimmedTarget || hasUriScheme(trimmedTarget)) {
    return trimmedTarget;
  }

  try {
    return decodeURIComponent(trimmedTarget);
  } catch {
    return trimmedTarget;
  }
}

function buildCacheKey(context: AttachmentResolverContext, rawTarget: string): string {
  return `${context.cacheNamespace}::${rawTarget.trim()}`;
}

async function cachedFileExists(path: string): Promise<boolean> {
  let pending = fileExistenceCache.get(path);
  if (pending) {
    return pending;
  }

  pending = getFileSystem()
    .then((fs) => fs.fileExists(path))
    .catch(() => false)
    .finally(() => {
      // Keep resolved entries only; retry on transient failures.
    });

  fileExistenceCache.set(path, pending);
  return pending;
}

export function createAttachmentResolverContext(
  files: FileNode[],
  rootFolderPath?: string | null,
  currentFilePath?: string | null
): AttachmentResolverContext {
  const filePaths: string[] = [];

  const visit = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file' && !node.isTrash) {
        filePaths.push(node.path);
      }
      if (node.children?.length) {
        visit(node.children);
      }
    }
  };

  visit(files);

  return {
    cacheNamespace: `${rootFolderPath ?? ''}::${currentFilePath ?? ''}::${filePaths.sort().join('|')}`,
    currentFilePath,
    rootFolderPath,
    files,
  };
}

export async function resolveAttachmentTarget(
  context: AttachmentResolverContext,
  rawTarget: string
): Promise<ResolvedAttachmentTarget | null> {
  const normalizedTarget = decodeLocalAttachmentTarget(rawTarget);
  if (!normalizedTarget) return null;

  const cacheKey = buildCacheKey(context, normalizedTarget);
  let pending = resolvedAttachmentCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  pending = (async () => {
    const matchedFile = resolveWikiLinkFile(
      context.files,
      normalizedTarget,
      context.rootFolderPath,
      context.currentFilePath
    );

    if (matchedFile) {
      return {
        path: matchedFile.path,
        name: matchedFile.name,
      };
    }

    try {
      const { dirname, join, normalize } = await import('@tauri-apps/api/path');
      const candidates = new Set<string>();

      if (/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(normalizedTarget)) {
        candidates.add(normalizedTarget);
      }

      if (context.currentFilePath) {
        candidates.add(await join(await dirname(context.currentFilePath), normalizedTarget));
      }

      if (context.rootFolderPath) {
        candidates.add(await join(context.rootFolderPath, normalizedTarget));
      }

      for (const candidate of candidates) {
        const normalizedCandidate = await normalize(candidate);
        if (await cachedFileExists(normalizedCandidate)) {
          const fileName = normalizedCandidate.split(/[\\/]/).pop() || normalizedTarget.split('/').pop() || normalizedTarget;
          return {
            path: normalizedCandidate,
            name: fileName,
          };
        }
      }
    } catch (error) {
      console.error('Failed to resolve attachment target:', normalizedTarget, error);
    }

    return null;
  })();

  resolvedAttachmentCache.set(cacheKey, pending);
  return pending;
}
