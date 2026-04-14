export function getPathSeparator(path: string): '/' | '\\' {
  return path.includes('\\') ? '\\' : '/';
}

export function joinFsPath(basePath: string, ...segments: string[]): string {
  return segments.filter(Boolean).reduce((currentPath, segment) => {
    const separator = getPathSeparator(currentPath);
    return currentPath.endsWith(separator)
      ? `${currentPath}${segment}`
      : `${currentPath}${separator}${segment}`;
  }, basePath);
}

/**
 * Normalize backslashes to forward slashes and strip trailing slashes.
 */
export function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Sanitize a resource folder name: trim, normalize slashes, strip
 * leading/trailing slashes and leading `./`. Rejects `..` path segments.
 */
export function sanitizeResourceFolder(folder: string): string {
  const cleaned = folder
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^\.\//, '');

  if (cleaned.split('/').some((s) => s === '..')) {
    throw new Error('Path traversal is not allowed in resource folder name');
  }

  return cleaned;
}

export function getPathBasename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}
