import type { FileNode } from "../types";
import { getPathBasename, getPathDirname } from "./pathHelpers";

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

function collectFilePaths(nodes: FileNode[], paths: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "file") {
      paths.push(node.path);
    }
    if (node.children) {
      collectFilePaths(node.children, paths);
    }
  }
  return paths;
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
 * Detect likely external renames for open tabs by pairing removed paths with newly added file paths.
 */
export function detectOpenTabPathRemaps(
  previousTree: FileNode[],
  nextTree: FileNode[],
  openTabs: string[],
): Record<string, string> {
  const prevFilePaths = new Set(collectFilePaths(previousTree));
  const nextFilePaths = collectFilePaths(nextTree);
  const addedPaths = nextFilePaths.filter((path) => !prevFilePaths.has(path));
  const removedTabIds = collectRemovedOpenTabIds(
    previousTree,
    nextTree,
    openTabs,
  );

  if (removedTabIds.length === 0 || addedPaths.length === 0) {
    return {};
  }

  const remaps: Record<string, string> = {};
  const usedAdded = new Set<string>();

  for (const tabId of removedTabIds) {
    const node = findFileInTree(previousTree, tabId);
    if (!node) continue;

    const sameNameMatch = addedPaths.find((path) => {
      if (usedAdded.has(path)) return false;
      return (
        getPathBasename(path) === node.name &&
        getPathDirname(path) === getPathDirname(node.path)
      );
    });
    if (sameNameMatch) {
      remaps[tabId] = sameNameMatch;
      usedAdded.add(sameNameMatch);
    }
  }

  const unmappedRemoved = removedTabIds.filter((id) => !remaps[id]);
  const unusedAdded = addedPaths.filter((path) => !usedAdded.has(path));
  if (unmappedRemoved.length === 1 && unusedAdded.length === 1) {
    remaps[unmappedRemoved[0]] = unusedAdded[0];
  }

  return remaps;
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
