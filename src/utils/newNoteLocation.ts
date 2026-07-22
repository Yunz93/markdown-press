import { getPathDirname, normalizeSlashes } from "./pathHelpers";
import type { NewNoteLocation } from "../types";

export function normalizeNewNoteLocation(value: unknown): NewNoteLocation {
  return value === "currentFileFolder"
    ? "currentFileFolder"
    : "knowledgeBaseRoot";
}

/**
 * Resolve where a global "new note" action should create the file.
 * Explicit folder paths (sidebar context menu) always win.
 */
export function resolveNewNoteFolderPath(options: {
  location: NewNoteLocation;
  rootFolderPath?: string | null;
  currentFilePath?: string | null;
  explicitFolderPath?: string | null;
}): string | undefined {
  const explicit = options.explicitFolderPath?.trim();
  if (explicit) {
    return explicit;
  }

  if (options.location !== "currentFileFolder") {
    return undefined;
  }

  const currentFilePath = options.currentFilePath?.trim();
  const rootFolderPath = options.rootFolderPath?.trim();
  if (!currentFilePath || !rootFolderPath) {
    return undefined;
  }

  const parentPath = getPathDirname(currentFilePath);
  const normalizedParent = normalizeSlashes(parentPath);
  const normalizedRoot = normalizeSlashes(rootFolderPath);

  if (
    normalizedParent === normalizedRoot ||
    normalizedParent.startsWith(`${normalizedRoot}/`)
  ) {
    return parentPath;
  }

  return undefined;
}
