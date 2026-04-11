export const DEFAULT_TRASH_FOLDER = '.trash';

export function sanitizeTrashFolder(value: string | null | undefined): string {
  const trimmed = (value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  const segment = trimmed.split('/').filter(Boolean).pop() ?? '';
  return segment || DEFAULT_TRASH_FOLDER;
}

export function normalizeTrashFolder(value: unknown): string {
  return typeof value === 'string' ? sanitizeTrashFolder(value) : DEFAULT_TRASH_FOLDER;
}

export function isTrashRootName(name: string, trashFolder: string): boolean {
  return name === sanitizeTrashFolder(trashFolder);
}

export function getTrashDepth(path: string, trashFolder: string): number {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  const trashIndex = segments.lastIndexOf(sanitizeTrashFolder(trashFolder));
  if (trashIndex < 0) return -1;
  return segments.length - trashIndex - 1;
}
