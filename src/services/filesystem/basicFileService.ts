import type { FileNode } from '../../types';

interface BasicCapableFileSystem {
  createDirectory(path: string): Promise<void>;
  createFile(path: string, content?: string): Promise<string>;
  openFile(): Promise<string | null>;
  readFile(path: string): Promise<string>;
  revealInExplorer?: (path: string) => Promise<void>;
}

type AsyncGuard = <T>(fn: () => Promise<T>, context: string) => Promise<T>;

export async function openStandaloneFile(
  fs: BasicCapableFileSystem,
  getPathBasename: (path: string) => string,
  withErrorHandling: AsyncGuard
): Promise<{ file: FileNode; content: string } | null> {
  const path = await fs.openFile();
  if (!path) return null;

  const content = await withErrorHandling(
    () => fs.readFile(path),
    'Failed to read file'
  );

  return {
    file: {
      id: path,
      name: getPathBasename(path),
      type: 'file',
      path,
      isTrash: false,
    },
    content,
  };
}

export async function createFileNode(
  fs: BasicCapableFileSystem,
  fullPath: string,
  fileName: string,
  content: string,
  withErrorHandling: AsyncGuard
): Promise<FileNode> {
  await withErrorHandling(
    () => fs.createFile(fullPath, content),
    'Failed to create file'
  );

  return {
    id: fullPath,
    name: fileName,
    type: 'file',
    path: fullPath,
    isTrash: false,
  };
}

export async function createFolderNode(
  fs: BasicCapableFileSystem,
  fullPath: string,
  folderName: string,
  withErrorHandling: AsyncGuard
): Promise<FileNode> {
  await withErrorHandling(
    () => fs.createDirectory(fullPath),
    'Failed to create folder'
  );

  return {
    id: fullPath,
    name: folderName,
    type: 'folder',
    path: fullPath,
    children: [],
    isTrash: false,
  };
}

export async function revealFileInExplorer(
  fs: BasicCapableFileSystem,
  path: string,
  withErrorHandling: AsyncGuard
): Promise<'revealed' | 'unsupported'> {
  if (!fs.revealInExplorer) {
    return 'unsupported';
  }

  await withErrorHandling(
    () => fs.revealInExplorer!(path),
    'Failed to reveal in explorer'
  );

  return 'revealed';
}
