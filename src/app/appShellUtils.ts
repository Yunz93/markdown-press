import type { FileNode } from '../types';

export function getPathBasename(path: string | null | undefined): string {
  if (!path) return '';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function findFileInTree(nodes: FileNode[], id: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFileInTree(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}
