import type { FileNode } from '../../types';

interface MutationCapableFileSystem {
  deleteFile(path: string): Promise<void>;
  moveFile?: (sourcePath: string, targetPath: string) => Promise<string>;
  readDirectory(dirPath: string): Promise<FileNode[]>;
}

type AsyncGuard = <T>(fn: () => Promise<T>, context: string) => Promise<T>;

interface TrashPathInfo {
  trashDirName: string;
  containerName: string;
  originalRelativePath: string;
}

interface DeleteFileParams {
  file: FileNode;
  fs: MutationCapableFileSystem;
  joinFsPath: (basePath: string, segment: string) => string;
  parseTrashPathInfo: (path: string, rootPath: string, trashFolder: string) => TrashPathInfo | null;
  rootPath: string | null;
  trashFolder: string;
  withErrorHandling: AsyncGuard;
}

export async function deleteFileAndCleanupTrash(params: DeleteFileParams): Promise<boolean> {
  const { file, fs, joinFsPath, parseTrashPathInfo, rootPath, trashFolder, withErrorHandling } = params;
  const parsedTrashInfo = rootPath ? parseTrashPathInfo(file.path, rootPath, trashFolder) : null;

  await withErrorHandling(
    () => fs.deleteFile(file.path),
    'Failed to delete file'
  );

  if (!rootPath || !parsedTrashInfo) {
    return false;
  }

  const trashContainerPath = joinFsPath(joinFsPath(rootPath, parsedTrashInfo.trashDirName), parsedTrashInfo.containerName);
  const containerChildren = await withErrorHandling(
    () => fs.readDirectory(trashContainerPath),
    'Failed to inspect trash container'
  );
  if (containerChildren.length === 0) {
    await withErrorHandling(
      () => fs.deleteFile(trashContainerPath),
      'Failed to cleanup empty trash container'
    );
  }

  return true;
}

export async function moveFilePath(
  fs: MutationCapableFileSystem,
  sourcePath: string,
  targetFolderPath: string,
  withErrorHandling: AsyncGuard
): Promise<string> {
  if (!fs.moveFile) {
    throw new Error('File move is not supported in this environment');
  }

  return withErrorHandling(
    () => fs.moveFile!(sourcePath, targetFolderPath),
    'Failed to move file'
  );
}
