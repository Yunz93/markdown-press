import type { FileNode } from '../types';
import { createHeadingSlug, flattenHeadingNodes, parseHeadings, type HeadingNode } from './outline';

export interface WikiLinkMatch {
  from: number;
  to: number;
  raw: string;
  embed: boolean;
}

export interface OpenWikiLinkMatch {
  from: number;
  to: number;
  rawQuery: string;
  pathQuery: string;
  headingQuery: string;
  hasHash: boolean;
  embed: boolean;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function getRelativePath(path: string, rootPath: string | null | undefined): string {
  const normalizedPath = normalizeSlashes(path);
  const normalizedRoot = rootPath ? normalizeSlashes(rootPath).replace(/\/+$/, '') : '';

  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }

  return normalizedPath;
}

export function stripMarkdownExtension(value: string): string {
  return value.replace(/\.(md|markdown)$/i, '');
}

export function isMarkdownNoteFile(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName);
}

export function flattenMarkdownFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => {
    if (node.type === 'folder') {
      return flattenMarkdownFiles(node.children ?? []);
    }

    if (node.isTrash || !isMarkdownNoteFile(node.name)) {
      return [];
    }

    return [node];
  });
}

export function getWikiLinkInsertPath(file: FileNode, rootFolderPath?: string | null): string {
  return stripMarkdownExtension(getRelativePath(file.path, rootFolderPath));
}

export function getWikiLinkDisplayPath(file: FileNode, rootFolderPath?: string | null): string {
  return getWikiLinkInsertPath(file, rootFolderPath) || stripMarkdownExtension(file.name);
}

export function getWikiHeadingCandidates(content: string): HeadingNode[] {
  return flattenHeadingNodes(parseHeadings(content));
}

export function findHeadingByReference(headings: HeadingNode[], rawReference: string): HeadingNode | null {
  const normalizedReference = rawReference.trim().replace(/^#+/, '').trim();
  if (!normalizedReference) return null;

  const headingCandidates = Array.from(new Set([
    normalizedReference,
    createHeadingSlug(normalizedReference),
  ]));

  return headings.find((heading) =>
    headingCandidates.includes(heading.id)
    || headingCandidates.includes(createHeadingSlug(heading.text))
    || headingCandidates.includes(heading.text.trim())
  ) ?? null;
}

export function findWikiLinkAt(text: string, pos: number): WikiLinkMatch | null {
  const safePos = Math.max(0, Math.min(pos, text.length));
  const start = text.lastIndexOf('[[', safePos);
  if (start < 0) return null;

  const end = text.indexOf(']]', start + 2);
  if (end < 0 || safePos < start || safePos > end + 2) {
    return null;
  }

  const raw = text.slice(start + 2, end);
  if (!raw.trim() || raw.includes('\n')) {
    return null;
  }

  return {
    from: start,
    to: end + 2,
    raw: raw.trim(),
    embed: start > 0 && text[start - 1] === '!',
  };
}

export function findOpenWikiLinkAt(text: string, pos: number): OpenWikiLinkMatch | null {
  const safePos = Math.max(0, Math.min(pos, text.length));
  const beforeCursor = text.slice(0, safePos);
  const start = beforeCursor.lastIndexOf('[[');
  if (start < 0) return null;

  const lastClose = beforeCursor.lastIndexOf(']]');
  if (lastClose > start) return null;

  const query = text.slice(start + 2, safePos);
  if (query.includes('\n') || query.includes('|')) {
    return null;
  }

  const closeAhead = text.indexOf(']]', start + 2);
  if (closeAhead >= 0 && closeAhead < safePos) {
    return null;
  }

  const hashIndex = query.indexOf('#');

  return {
    from: hashIndex >= 0 ? start + 3 + hashIndex : start + 2,
    to: safePos,
    rawQuery: query,
    pathQuery: hashIndex >= 0 ? query.slice(0, hashIndex) : query,
    headingQuery: hashIndex >= 0 ? query.slice(hashIndex + 1) : '',
    hasHash: hashIndex >= 0,
    embed: start > 0 && text[start - 1] === '!',
  };
}
