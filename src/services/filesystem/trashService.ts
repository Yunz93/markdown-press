import type { FileNode } from '../../types';

interface TrashCapableFileSystem {
  createDirectory(path: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  moveFile?: (sourcePath: string, targetPath: string) => Promise<string>;
  readDirectory(dirPath: string): Promise<FileNode[]>;
}

interface TrashPathInfo {
  trashDirName: string;
  containerName: string;
  originalRelativePath: string;
}

type AsyncGuard = <T>(fn: () => Promise<T>, context: string) => Promise<T>;

interface MoveToTrashParams {
  file: FileNode;
  fs: TrashCapableFileSystem;
  getParentRelativePath: (relativePath: string) => string;
  getRelativePathFromRoot: (path: string, rootPath: string) => string;
  isPathInTrash: (path: string, rootPath: string, trashFolder: string) => boolean;
  joinFsPath: (basePath: string, segment: string) => string;
  createTrashContainerName: (parentRelativePath: string) => string;
  registerAllowedPath: (path: string, recursive: boolean) => Promise<void>;
  rootPath: string | null;
  trashFolder: string;
  ensureTrashRootDirectory: (fs: TrashCapableFileSystem, rootPath: string, trashFolder: string) => Promise<{
    trashDirName: string;
    trashRootPath: string;
  }>;
  withErrorHandling: AsyncGuard;
}

interface RestoreFromTrashParams {
  file: FileNode;
  fs: TrashCapableFileSystem;
  getParentRelativePath: (relativePath: string) => string;
  getPathBasename: (path: string) => string;
  joinFsPath: (basePath: string, segment: string) => string;
  joinPathSegments: (basePath: string, ...segments: string[]) => string;
  parseTrashPathInfo: (path: string, rootPath: string, trashFolder: string) => TrashPathInfo | null;
  rootPath: string | null;
  trashFolder: string;
  withErrorHandling: AsyncGuard;
}

export type MoveToTrashResult =
  | { kind: 'success'; movedPath: string }
  | { kind: 'no_root' | 'already_in_trash' | 'unsupported' };

export type RestoreFromTrashResult =
  | { kind: 'success'; restoredPath: string }
  | { kind: 'no_root' | 'invalid_path' | 'unsupported' | 'target_exists' };

export async function moveItemToTrash(params: MoveToTrashParams): Promise<MoveToTrashResult> {
  const {
    file,
    fs,
    getParentRelativePath,
    getRelativePathFromRoot,
    isPathInTrash,
    joinFsPath,
    createTrashContainerName,
    registerAllowedPath,
    rootPath,
    trashFolder,
    ensureTrashRootDirectory,
    withErrorHandling,
  } = params;

  if (!rootPath) return { kind: 'no_root' };
  if (isPathInTrash(file.path, rootPath, trashFolder)) return { kind: 'already_in_trash' };
  if (!fs.moveFile) return { kind: 'unsupported' };

  const { trashRootPath } = await withErrorHandling(
    () => ensureTrashRootDirectory(fs, rootPath, trashFolder),
    'Failed to create trash directory'
  );

  await withErrorHandling(
    () => registerAllowedPath(trashRootPath, true),
    'Failed to register trash directory scope'
  );

  const relativePath = getRelativePathFromRoot(file.path, rootPath);
  const parentRelativePath = getParentRelativePath(relativePath);
  const containerName = createTrashContainerName(parentRelativePath);
  const containerPath = joinFsPath(trashRootPath, containerName);

  await withErrorHandling(
    () => fs.createDirectory(containerPath),
    'Failed to prepare trash container'
  );

  const movedPath = await withErrorHandling(
    () => fs.moveFile!(file.path, containerPath),
    'Failed to move item to trash'
  );

  return { kind: 'success', movedPath };
}

export async function restoreItemFromTrash(params: RestoreFromTrashParams): Promise<RestoreFromTrashResult> {
  const {
    file,
    fs,
    getParentRelativePath,
    getPathBasename,
    joinFsPath,
    joinPathSegments,
    parseTrashPathInfo,
    rootPath,
    trashFolder,
    withErrorHandling,
  } = params;

  if (!rootPath) return { kind: 'no_root' };

  const parsed = parseTrashPathInfo(file.path, rootPath, trashFolder);
  if (!parsed) return { kind: 'invalid_path' };
  if (!fs.moveFile) return { kind: 'unsupported' };

  const targetParentRelative = getParentRelativePath(parsed.originalRelativePath);
  const targetParentPath = targetParentRelative
    ? joinPathSegments(rootPath, ...targetParentRelative.split('/').filter(Boolean))
    : rootPath;

  await withErrorHandling(
    () => fs.createDirectory(targetParentPath),
    'Failed to prepare restore target'
  );

  const targetPath = joinFsPath(targetParentPath, getPathBasename(file.path));
  const targetExists = await withErrorHandling(
    () => fs.fileExists(targetPath),
    'Failed to check restore target'
  );
  if (targetExists) return { kind: 'target_exists' };

  const restoredPath = await withErrorHandling(
    () => fs.moveFile!(file.path, targetParentPath),
    'Failed to restore item from trash'
  );

  const trashContainerPath = joinFsPath(joinFsPath(rootPath, parsed.trashDirName), parsed.containerName);
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

  return { kind: 'success', restoredPath };
}
