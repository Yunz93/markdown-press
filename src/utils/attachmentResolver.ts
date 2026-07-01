import type { FileNode } from "../types";
import { getFileSystem, isTauriEnvironment } from "../types/filesystem";
import { getPathDirname, joinFsPath, normalizeSlashes } from "./pathHelpers";
import { resolveWikiLinkFile } from "./wikiLinks";

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

const resolvedAttachmentCache = new Map<
  string,
  Promise<ResolvedAttachmentTarget | null>
>();
const fileExistenceCache = new Map<string, Promise<boolean>>();
const attachmentContextCache = new Map<string, AttachmentResolverContext>();

export function clearAttachmentResolverCache(): void {
  resolvedAttachmentCache.clear();
  fileExistenceCache.clear();
  attachmentContextCache.clear();
}

function hasUriScheme(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value) || value.startsWith("//");
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

function buildCacheKey(
  context: AttachmentResolverContext,
  rawTarget: string,
): string {
  return `${context.cacheNamespace}::${rawTarget.trim()}`;
}

function invalidateResolvedCacheForPath(path: string): void {
  for (const [key, pending] of [...resolvedAttachmentCache.entries()]) {
    void pending.then((result) => {
      if (result?.path === path) {
        resolvedAttachmentCache.delete(key);
      }
    });
  }
}

async function cachedFileExists(path: string): Promise<boolean> {
  let pending = fileExistenceCache.get(path);
  if (pending) {
    return pending;
  }

  pending = getFileSystem()
    .then((fs) => fs.fileExists(path))
    .catch(() => false)
    .then((exists) => {
      if (!exists) {
        fileExistenceCache.delete(path);
        invalidateResolvedCacheForPath(path);
      }
      return exists;
    });

  fileExistenceCache.set(path, pending);
  return pending;
}

async function normalizeAttachmentCandidate(
  candidate: string,
): Promise<string> {
  if (isTauriEnvironment()) {
    const { normalize } = await import("@tauri-apps/api/path");
    return normalize(candidate);
  }

  return normalizeSlashes(candidate);
}

async function buildAttachmentPathCandidates(
  normalizedTarget: string,
  context: AttachmentResolverContext,
): Promise<string[]> {
  const candidates = new Set<string>();

  if (/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(normalizedTarget)) {
    candidates.add(normalizedTarget);
  }

  if (context.currentFilePath) {
    candidates.add(
      joinFsPath(getPathDirname(context.currentFilePath), normalizedTarget),
    );
  }

  if (context.rootFolderPath) {
    candidates.add(joinFsPath(context.rootFolderPath, normalizedTarget));
  }

  const normalizedCandidates: string[] = [];
  for (const candidate of candidates) {
    normalizedCandidates.push(await normalizeAttachmentCandidate(candidate));
  }

  return normalizedCandidates;
}

export function createAttachmentResolverContext(
  files: FileNode[],
  rootFolderPath?: string | null,
  currentFilePath?: string | null,
): AttachmentResolverContext {
  const filePaths: string[] = [];

  const visit = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.type === "file" && !node.isTrash) {
        filePaths.push(node.path);
      }
      if (node.children?.length) {
        visit(node.children);
      }
    }
  };

  visit(files);

  const namespaceKey = `${rootFolderPath ?? ""}::${currentFilePath ?? ""}::${filePaths.sort().join("|")}`;
  const cached = attachmentContextCache.get(namespaceKey);
  if (cached) {
    return cached;
  }

  const context: AttachmentResolverContext = {
    cacheNamespace: namespaceKey,
    currentFilePath,
    rootFolderPath,
    files,
  };
  attachmentContextCache.set(namespaceKey, context);
  return context;
}

async function resolveAttachmentTargetUncached(
  context: AttachmentResolverContext,
  normalizedTarget: string,
): Promise<ResolvedAttachmentTarget | null> {
  const matchedFile = resolveWikiLinkFile(
    context.files,
    normalizedTarget,
    context.rootFolderPath,
    context.currentFilePath,
  );

  if (matchedFile) {
    return {
      path: matchedFile.path,
      name: matchedFile.name,
    };
  }

  try {
    const candidates = await buildAttachmentPathCandidates(
      normalizedTarget,
      context,
    );

    for (const normalizedCandidate of candidates) {
      if (await cachedFileExists(normalizedCandidate)) {
        const fileName =
          normalizedCandidate.split(/[\\/]/).pop() ||
          normalizedTarget.split("/").pop() ||
          normalizedTarget;
        return {
          path: normalizedCandidate,
          name: fileName,
        };
      }
    }
  } catch (error) {
    console.error(
      "Failed to resolve attachment target:",
      normalizedTarget,
      error,
    );
  }

  return null;
}

export async function resolveAttachmentTarget(
  context: AttachmentResolverContext,
  rawTarget: string,
): Promise<ResolvedAttachmentTarget | null> {
  const normalizedTarget = decodeLocalAttachmentTarget(rawTarget);
  if (!normalizedTarget) return null;

  const cacheKey = buildCacheKey(context, normalizedTarget);
  let pending = resolvedAttachmentCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  pending = resolveAttachmentTargetUncached(context, normalizedTarget).then(
    (result) => {
      if (result !== null) {
        resolvedAttachmentCache.set(cacheKey, Promise.resolve(result));
      }
      return result;
    },
  );

  return pending;
}
