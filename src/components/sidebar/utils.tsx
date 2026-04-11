import type { FileNode } from '../../types';
import React from 'react';
import { DEFAULT_TRASH_FOLDER, getTrashDepth as getConfiguredTrashDepth, isTrashRootName, sanitizeTrashFolder } from '../../utils/trashFolder';

function hasValidTrashContainer(path: string, trashFolder: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  const trashIndex = segments.lastIndexOf(sanitizeTrashFolder(trashFolder));
  if (trashIndex < 0) return false;

  const containerName = segments[trashIndex + 1];
  return /^\d+__.+$/.test(containerName ?? '');
}

export const getTrashItems = (nodes: FileNode[], trashFolder: string = DEFAULT_TRASH_FOLDER): FileNode[] => {
  const trash: FileNode[] = [];
  const normalizedTrashFolder = sanitizeTrashFolder(trashFolder);
  const collect = (items: FileNode[]) => {
    for (const node of items) {
      if (
        node.isTrash &&
        getConfiguredTrashDepth(node.path, normalizedTrashFolder) === 2 &&
        hasValidTrashContainer(node.path, normalizedTrashFolder)
      ) {
        trash.push(node);
      }
      if (node.children) {
        collect(node.children);
      }
    }
  };

  collect(nodes);
  return trash.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
};

export const isTrashRootNode = (node: FileNode, trashFolder: string = DEFAULT_TRASH_FOLDER): boolean =>
  node.type === 'folder' && isTrashRootName(node.name, trashFolder);

export const normalizeSearchTarget = (name: string): string =>
  name.replace(/\.md$/i, '').toLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const filterNodesByFileName = (
  nodes: FileNode[],
  query: string,
  trashFolder: string = DEFAULT_TRASH_FOLDER
): FileNode[] => {
  if (!query.trim()) {
    return nodes
      .filter((node) => !node.isTrash && !isTrashRootNode(node, trashFolder))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  const normalizedQuery = query.trim().toLowerCase();

  return nodes
    .reduce<FileNode[]>((acc, node) => {
      if (node.isTrash || isTrashRootNode(node, trashFolder)) return acc;

      if (node.type === 'folder') {
        const filteredChildren = filterNodesByFileName(node.children ?? [], normalizedQuery, trashFolder);
        if (filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren,
          });
        }
        return acc;
      }

      if (
        normalizeSearchTarget(node.name).includes(normalizedQuery) ||
        node.name.toLowerCase().includes(normalizedQuery)
      ) {
        acc.push(node);
      }

      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
};

export const highlightSearchText = (text: string, query: string): React.ReactNode => {
  if (!query.trim()) return text;

  const normalizedQuery = query.toLowerCase();
  return text.split(new RegExp(`(${escapeRegExp(query)})`, 'ig')).map((part, index) =>
    part.toLowerCase() === normalizedQuery ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-amber-200/80 px-0.5 text-amber-950 dark:bg-amber-300/80 dark:text-amber-950"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    )
  );
};
