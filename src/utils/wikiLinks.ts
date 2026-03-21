import type { FileNode } from '../types';

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, '');
}

function stripWikiLinkMetadata(value: string): string {
  return value.split('#')[0]?.trim() ?? '';
}

export function parseWikiLinkReference(raw: string): {
  target: string;
  displayText: string;
} {
  const [targetPart, aliasPart] = raw.split('|');
  const target = (targetPart ?? '').trim();
  const cleanedTarget = stripWikiLinkMetadata(target);
  const headingPart = target.includes('#') ? target.split('#').slice(1).join('#').trim() : '';
  const fallbackLabel = target.startsWith('#')
    ? headingPart
    : stripMarkdownExtension(cleanedTarget.split('/').filter(Boolean).pop() || cleanedTarget);

  return {
    target,
    displayText: (aliasPart ?? '').trim() || fallbackLabel,
  };
}

function normalizeWikiLinkTarget(target: string): string {
  return stripMarkdownExtension(
    normalizeSlashes(stripWikiLinkMetadata(target))
      .replace(/^\/+/, '')
      .replace(/^\.\//, '')
      .trim()
  ).toLowerCase();
}

function getRelativePath(path: string, rootPath: string | null | undefined): string {
  const normalizedPath = normalizeSlashes(path);
  const normalizedRoot = rootPath ? normalizeSlashes(rootPath).replace(/\/+$/, '') : '';

  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }

  return normalizedPath;
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  return nodes.flatMap((node) => {
    if (node.type === 'folder') {
      return flattenFiles(node.children ?? []);
    }

    return node.isTrash ? [] : [node];
  });
}

export function resolveWikiLinkFile(
  files: FileNode[],
  target: string,
  rootFolderPath?: string | null,
  currentFilePath?: string | null
): FileNode | null {
  const normalizedTarget = normalizeWikiLinkTarget(target);
  if (!normalizedTarget) return null;

  const targetBasename = normalizedTarget.split('/').filter(Boolean).pop() || normalizedTarget;

  const allFiles = flattenFiles(files);
  const currentRelativePath = currentFilePath && rootFolderPath
    ? getRelativePath(currentFilePath, rootFolderPath)
    : '';
  const currentDir = currentRelativePath.includes('/')
    ? currentRelativePath.split('/').slice(0, -1).join('/')
    : '';
  const relativeCandidate = currentDir ? `${currentDir}/${normalizedTarget}` : normalizedTarget;

  let exactPathMatch: FileNode | null = null;
  let relativePathMatch: FileNode | null = null;
  let basenameMatch: FileNode | null = null;

  for (const file of allFiles) {
    const relativePath = stripMarkdownExtension(getRelativePath(file.path, rootFolderPath)).toLowerCase();
    const basename = stripMarkdownExtension(file.name).toLowerCase();

    if (!exactPathMatch && relativePath === normalizedTarget) {
      exactPathMatch = file;
    }

    if (!relativePathMatch && (relativePath === relativeCandidate.toLowerCase() || relativePath.endsWith(`/${normalizedTarget}`))) {
      relativePathMatch = file;
    }

    if (!basenameMatch && (basename === normalizedTarget || basename === targetBasename)) {
      basenameMatch = file;
    }
  }

  return exactPathMatch || relativePathMatch || basenameMatch;
}
