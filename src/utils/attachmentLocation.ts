import type { AttachmentLocation } from "../types";
import {
  getPathDirname,
  joinFsPath,
  normalizeSlashes,
  sanitizeResourceFolder,
} from "./pathHelpers";

export const DEFAULT_ATTACHMENT_LOCATION: AttachmentLocation = "resourceFolder";
export const DEFAULT_RESOURCE_FOLDER = "resources";

export function normalizeAttachmentLocation(
  value: unknown,
): AttachmentLocation {
  if (value === "sameAsCurrent") return "sameAsCurrent";
  if (value === "subfolderUnderCurrent") return "subfolderUnderCurrent";
  return "resourceFolder";
}

function resolveSanitizedResourceFolder(resourceFolder: string): string {
  try {
    return sanitizeResourceFolder(resourceFolder) || DEFAULT_RESOURCE_FOLDER;
  } catch {
    return DEFAULT_RESOURCE_FOLDER;
  }
}

function isPathInsideRoot(path: string, rootFolderPath: string): boolean {
  const normalizedPath = normalizeSlashes(path);
  const normalizedRoot = normalizeSlashes(rootFolderPath);
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

/**
 * Resolve where a pasted/dropped attachment should be stored, plus the
 * markdown path prefix (directory segment, no trailing slash) used in links.
 */
export function resolveAttachmentTargetDir(options: {
  location: AttachmentLocation;
  rootFolderPath: string;
  currentFilePath?: string | null;
  resourceFolder: string;
}): { absoluteDir: string; markdownRelativePathPrefix: string } {
  const rootFolderPath = options.rootFolderPath.trim();
  const sanitizedResourceFolder = resolveSanitizedResourceFolder(
    options.resourceFolder,
  );
  const location = normalizeAttachmentLocation(options.location);
  const currentFilePath = options.currentFilePath?.trim() || null;
  const currentDir =
    currentFilePath && isPathInsideRoot(currentFilePath, rootFolderPath)
      ? getPathDirname(currentFilePath)
      : null;

  if (location === "sameAsCurrent" && currentDir) {
    return {
      absoluteDir: currentDir,
      markdownRelativePathPrefix: "",
    };
  }

  if (location === "subfolderUnderCurrent" && currentDir) {
    return {
      absoluteDir: joinFsPath(currentDir, sanitizedResourceFolder),
      markdownRelativePathPrefix: sanitizedResourceFolder,
    };
  }

  return {
    absoluteDir: joinFsPath(rootFolderPath, sanitizedResourceFolder),
    markdownRelativePathPrefix: sanitizedResourceFolder,
  };
}
