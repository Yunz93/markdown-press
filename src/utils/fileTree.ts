import type { FileNode } from "../types";

function collectTreePaths(nodes: FileNode[], paths: string[] = []): string[] {
  for (const node of nodes) {
    paths.push(node.path);
    if (node.children) {
      collectTreePaths(node.children, paths);
    }
  }
  return paths;
}

export function buildFileTreeSignature(nodes: FileNode[]): string {
  return collectTreePaths(nodes).sort().join("\n");
}

export function collectRemovedOpenTabIds(
  previousTree: FileNode[],
  nextTree: FileNode[],
  openTabs: string[],
): string[] {
  const nextPaths = new Set(collectTreePaths(nextTree));
  return openTabs.filter((tabId) => {
    const node = findFileInTree(previousTree, tabId);
    if (!node || node.type !== "file") return false;
    return !nextPaths.has(node.path);
  });
}

/**
 * Recursively find a node in a file tree by its `id`.
 * Shared implementation used across hooks and components.
 */
export function findFileInTree(
  nodes: FileNode[],
  id: string,
): FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFileInTree(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Build a flat map of all nodes keyed by `id` for O(1) lookups.
 */
export function buildFileMap(
  nodes: FileNode[],
  map: Map<string, FileNode> = new Map(),
): Map<string, FileNode> {
  for (const node of nodes) {
    map.set(node.id, node);
    if (node.children) {
      buildFileMap(node.children, map);
    }
  }
  return map;
}

/**
 * Depth-first search for the first node matching a predicate.
 */
export function findFirstMatchingFile(
  nodes: FileNode[],
  predicate: (node: FileNode) => boolean,
): FileNode | null {
  for (const node of nodes) {
    if (predicate(node)) {
      return node;
    }
    if (node.children) {
      const found = findFirstMatchingFile(node.children, predicate);
      if (found) {
        return found;
      }
    }
  }
  return null;
}
