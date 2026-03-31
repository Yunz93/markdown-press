import type { FileNode } from '../../types';
import React from 'react';

const TRASH_ROOT_NAMES = new Set(['.trash', '_markdown_press_trash']);

const getTrashDepth = (path: string): number => {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  const trashIndex = Math.max(
    segments.lastIndexOf('.trash'),
    segments.lastIndexOf('_markdown_press_trash')
  );
  if (trashIndex < 0) return -1;
  return segments.length - trashIndex - 1;
};

export const getTrashItems = (nodes: FileNode[]): FileNode[] => {
  const trash: FileNode[] = [];
  const collect = (items: FileNode[]) => {
    for (const node of items) {
      if (node.isTrash && getTrashDepth(node.path) === 2) {
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

export const isTrashRootNode = (node: FileNode): boolean =>
  node.type === 'folder' && TRASH_ROOT_NAMES.has(node.name);

export const normalizeSearchTarget = (name: string): string =>
  name.replace(/\.md$/i, '').toLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const filterNodesByFileName = (nodes: FileNode[], query: string): FileNode[] => {
  if (!query.trim()) {
    return nodes
      .filter((node) => !node.isTrash && !isTrashRootNode(node))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  const normalizedQuery = query.trim().toLowerCase();

  return nodes
    .reduce<FileNode[]>((acc, node) => {
      if (node.isTrash || isTrashRootNode(node)) return acc;

      if (node.type === 'folder') {
        const filteredChildren = filterNodesByFileName(node.children ?? [], normalizedQuery);
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
