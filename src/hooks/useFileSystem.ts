import { useCallback } from 'react';
import { getFileSystem } from '../types/filesystem';
import { useAppStore } from '../store/appStore';
import { withErrorHandling, FileSystemError } from '../utils/errorHandler';
import type { FileNode } from '../types';

const PRIMARY_TRASH_DIR_NAME = '.trash';
const LEGACY_TRASH_DIR_NAMES = ['_markdown_press_trash'] as const;
const TRASH_DIR_NAMES = [PRIMARY_TRASH_DIR_NAME, ...LEGACY_TRASH_DIR_NAMES] as const;
const TRASH_ROOT_MARKER = '__root__';

function getPathSeparator(path: string): '/' | '\\' {
  return path.includes('\\') ? '\\' : '/';
}

function getPathBasename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function joinPath(basePath: string, segment: string): string {
  const sep = getPathSeparator(basePath);
  if (basePath.endsWith('/') || basePath.endsWith('\\')) {
    return `${basePath}${segment}`;
  }
  return `${basePath}${sep}${segment}`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

function joinPathSegments(basePath: string, ...segments: string[]): string {
  return segments.filter(Boolean).reduce((acc, segment) => joinPath(acc, segment), basePath);
}

function getRelativePathFromRoot(path: string, rootPath: string): string {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(rootPath);
  if (normalizedPath === normalizedRoot) return '';
  const withSlash = `${normalizedRoot}/`;
  if (normalizedPath.startsWith(withSlash)) {
    return normalizedPath.slice(withSlash.length);
  }
  return normalizedPath;
}

function getParentRelativePath(relativePath: string): string {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

function isPathInTrash(path: string, rootPath: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(rootPath);
  return TRASH_DIR_NAMES.some((trashDirName) =>
    normalizedPath === `${normalizedRoot}/${trashDirName}` ||
    normalizedPath.startsWith(`${normalizedRoot}/${trashDirName}/`)
  );
}

function createTrashContainerName(parentRelativePath: string): string {
  const encodedParent = encodeURIComponent(parentRelativePath || TRASH_ROOT_MARKER);
  return `${Date.now()}__${encodedParent}`;
}

function parseTrashPathInfo(
  path: string,
  rootPath: string
): { trashDirName: string; containerName: string; originalRelativePath: string } | null {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(rootPath);
  for (const trashDirName of TRASH_DIR_NAMES) {
    const trashPrefix = `${normalizedRoot}/${trashDirName}/`;
    if (!normalizedPath.startsWith(trashPrefix)) continue;

    const remainder = normalizedPath.slice(trashPrefix.length);
    const parts = remainder.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const [containerName, ...itemParts] = parts;
    const match = containerName.match(/^\d+__(.+)$/);
    const encodedParent = match?.[1];
    let parentRelativePath = '';
    if (encodedParent) {
      try {
        const decoded = decodeURIComponent(encodedParent);
        parentRelativePath = decoded === TRASH_ROOT_MARKER ? '' : decoded;
      } catch {
        parentRelativePath = '';
      }
    }

    const originalRelativePath = [
      ...parentRelativePath.split('/').filter(Boolean),
      ...itemParts
    ].join('/');

    return {
      trashDirName,
      containerName,
      originalRelativePath
    };
  }

  return null;
}

async function ensureTrashRootDirectory(fs: Awaited<ReturnType<typeof getFileSystem>>, rootPath: string): Promise<{
  trashDirName: string;
  trashRootPath: string;
}> {
  let lastError: unknown = null;

  for (const trashDirName of TRASH_DIR_NAMES) {
    const trashRootPath = joinPath(rootPath, trashDirName);

    try {
      await fs.createDirectory(trashRootPath);
      return {
        trashDirName,
        trashRootPath
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to prepare trash directory');
}

/**
 * Hook for file system operations
 * Automatically selects the appropriate file system implementation based on environment
 */
export function useFileSystem() {
  const {
    files,
    setFiles,
    setCurrentFilePath,
    setRootFolderPath,
    clearAllCache,
    showNotification,
    addTab,
  } = useAppStore();

  const updateKnowledgeBaseMetadata = useCallback((path: string) => {
    const name = getPathBasename(path);
    const now = new Date().toISOString();

    useAppStore.getState().updateSettings((state) => {
      const existing = state.settings.knowledgeBases || [];
      const next = [{ path, name, lastOpenedAt: now }, ...existing.filter((kb) => kb.path !== path)]
        .slice(0, 20);

      return {
        knowledgeBases: next,
        lastKnowledgeBasePath: path
      };
    });
  }, []);

  const refreshFileTree = useCallback(async (): Promise<void> => {
    const rootPath = useAppStore.getState().rootFolderPath;
    if (!rootPath) return;

    const fs = await getFileSystem();
    const fileNodes = await withErrorHandling(
      () => fs.readDirectory(rootPath),
      'Failed to refresh knowledge base'
    );
    setFiles(fileNodes);
  }, [setFiles]);

  /**
   * Handle file system errors with user-friendly notifications
   */
  const handleFileSystemError = useCallback((error: unknown, context: string) => {
    if (error instanceof FileSystemError) {
      showNotification(error.toUserMessage(), 'error');
    } else {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showNotification(`${context}: ${message}`, 'error');
    }
  }, [showNotification]);

  /**
   * Open a single file
   */
  const openFile = useCallback(async () => {
    try {
      const fs = await getFileSystem();
      const path = await fs.openFile();
      if (path) {
        const content = await withErrorHandling(
          () => fs.readFile(path),
          'Failed to read file'
        );
        const fileName = getPathBasename(path);

        const newFile: FileNode = {
          id: path,
          name: fileName,
          type: 'file',
          path,
          isTrash: false
        };

        setFiles([newFile]);
        addTab(path, content);
        setCurrentFilePath(path);
        showNotification('File opened successfully', 'success');
      }
    } catch (error) {
      handleFileSystemError(error, 'Failed to open file');
    }
  }, [setFiles, addTab, setCurrentFilePath, showNotification, handleFileSystemError]);

  /**
   * Open a knowledge base directory.
   * If path is provided, opens directly; otherwise prompts user to select.
   */
  const openKnowledgeBase = useCallback(async (
    path?: string,
    options?: { silentSuccess?: boolean }
  ): Promise<string | null> => {
    try {
      const fs = await getFileSystem();
      const dirPath = path || await fs.openDirectory();
      if (dirPath) {
        const fileNodes = await withErrorHandling(
          () => fs.readDirectory(dirPath),
          'Failed to read knowledge base'
        );
        clearAllCache();
        setCurrentFilePath(null);
        setFiles(fileNodes);
        setRootFolderPath(dirPath);
        updateKnowledgeBaseMetadata(dirPath);
        if (!options?.silentSuccess) {
          showNotification('Knowledge base opened successfully', 'success');
        }
      }
      return dirPath || null;
    } catch (error) {
      handleFileSystemError(error, 'Failed to open knowledge base');
      return null;
    }
  }, [clearAllCache, setCurrentFilePath, setFiles, setRootFolderPath, showNotification, handleFileSystemError, updateKnowledgeBaseMetadata]);

  /**
   * Backward-compatible alias used by existing UI call sites.
   */
  const openDirectory = useCallback(async () => {
    await openKnowledgeBase();
  }, [openKnowledgeBase]);

  /**
   * Read a file
   */
  const readFile = useCallback(async (file: FileNode): Promise<string> => {
    return withErrorHandling(
      async () => {
        const fs = await getFileSystem();
        return await fs.readFile(file.path);
      },
      `Failed to read file: ${file.name}`
    );
  }, []);

  /**
   * Write a file
   */
  const writeFile = useCallback(async (path: string, content: string): Promise<void> => {
    await withErrorHandling(
      async () => {
        const fs = await getFileSystem();
        await fs.writeFile(path, content);
      },
      'Failed to write file'
    );
  }, []);

  const writeBinaryFile = useCallback(async (path: string, content: Uint8Array): Promise<void> => {
    await withErrorHandling(
      async () => {
        const fs = await getFileSystem();
        if (typeof fs.writeBinaryFile === 'function') {
          await fs.writeBinaryFile(path, content);
          return;
        }

        const decoded = new TextDecoder().decode(content);
        await fs.writeFile(path, decoded);
      },
      'Failed to write binary file'
    );
  }, []);

  /**
   * Save current file
   */
  const saveFile = useCallback(async (path: string | null, content: string): Promise<string | null> => {
    try {
      const fs = await getFileSystem();
      const savedPath = await withErrorHandling(
        () => fs.saveFile(path, content),
        'Failed to save file'
      );
      if (savedPath && path !== savedPath) {
        setCurrentFilePath(savedPath);
      }
      return savedPath;
    } catch (error) {
      handleFileSystemError(error, 'Failed to save file');
      return null;
    }
  }, [setCurrentFilePath, handleFileSystemError]);

  /**
   * Create a new file
   */
  const createFile = useCallback(async (fileName: string, content: string = '', folderPath?: string): Promise<FileNode | null> => {
    try {
      const fs = await getFileSystem();
      const basePath = folderPath || useAppStore.getState().rootFolderPath;
      if (!basePath) {
        showNotification('No knowledge base opened. Please open one first.', 'error');
        return null;
      }

      const fullPath = joinPath(basePath, fileName);
      await withErrorHandling(
        () => fs.createFile(fullPath, content),
        'Failed to create file'
      );

      const newFile: FileNode = {
        id: fullPath,
        name: fileName,
        type: 'file',
        path: fullPath,
        isTrash: false
      };

      // Add to store recursively
      useAppStore.getState().addFile(newFile);

      return newFile;
    } catch (error) {
      handleFileSystemError(error, 'Failed to create file');
      return null;
    }
  }, [showNotification, handleFileSystemError]);

  /**
   * Create a new folder
   */
  const createFolder = useCallback(async (folderName: string, parentPath?: string): Promise<FileNode | null> => {
    try {
      const fs = await getFileSystem();
      const basePath = parentPath || useAppStore.getState().rootFolderPath;
      if (!basePath) {
        showNotification('No knowledge base opened. Please open one first.', 'error');
        return null;
      }

      const fullPath = joinPath(basePath, folderName);
      await withErrorHandling(
        () => fs.createDirectory(fullPath),
        'Failed to create folder'
      );

      const newNode: FileNode = {
        id: fullPath,
        name: folderName,
        type: 'folder',
        path: fullPath,
        children: [],
        isTrash: false
      };

      useAppStore.getState().addFile(newNode);
      return newNode;
    } catch (error) {
      handleFileSystemError(error, 'Failed to create folder');
      return null;
    }
  }, [showNotification, handleFileSystemError]);

  /**
   * Reveal in explorer
   */
  const revealInExplorer = useCallback(async (path: string) => {
    try {
      const fs = await getFileSystem();
      if (fs.revealInExplorer) {
        await withErrorHandling(
          () => fs.revealInExplorer!(path),
          'Failed to reveal in explorer'
        );
      } else {
        showNotification('Reveal in explorer not supported in this environment', 'error');
      }
    } catch (error) {
      handleFileSystemError(error, 'Failed to reveal in explorer');
    }
  }, [showNotification, handleFileSystemError]);

  /**
   * Rename a file
   */
  const renameFile = useCallback(async (file: FileNode, newName: string): Promise<string | null> => {
    try {
      const fs = await getFileSystem();
      const newPath = await withErrorHandling(
        () => fs.renameEntry
          ? fs.renameEntry(file.path, newName, file.type === 'folder')
          : fs.renameFile(file.path, newName),
        `Failed to rename ${file.type}`
      );
      if (newPath) {
        const normalizedName = file.type === 'file'
          ? (newName.endsWith('.md') ? newName : `${newName}.md`)
          : newName;
        useAppStore.getState().updateFileName(file.id, normalizedName, newPath);
      }
      return newPath;
    } catch (error) {
      handleFileSystemError(error, `Failed to rename ${file.type}`);
      return null;
    }
  }, [handleFileSystemError]);

  /**
   * Delete a file
   */
  const deleteFile = useCallback(async (file: FileNode): Promise<void> => {
    try {
      const rootPath = useAppStore.getState().rootFolderPath;
      const parsedTrashInfo = rootPath ? parseTrashPathInfo(file.path, rootPath) : null;
      const fs = await getFileSystem();
      await withErrorHandling(
        () => fs.deleteFile(file.path),
        'Failed to delete file'
      );

      if (rootPath && parsedTrashInfo) {
        const trashContainerPath = joinPath(joinPath(rootPath, parsedTrashInfo.trashDirName), parsedTrashInfo.containerName);
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
        await refreshFileTree();
      } else {
        useAppStore.getState().removeFile(file.id);
      }
    } catch (error) {
      handleFileSystemError(error, 'Failed to delete file');
      throw error; // Re-throw to let caller handle it
    }
  }, [refreshFileTree, handleFileSystemError]);

  /**
   * Move a file/folder to trash (soft delete)
   */
  const moveToTrash = useCallback(async (file: FileNode): Promise<string | null> => {
    try {
      const rootPath = useAppStore.getState().rootFolderPath;
      if (!rootPath) {
        showNotification('No knowledge base opened. Please open one first.', 'error');
        return null;
      }

      if (isPathInTrash(file.path, rootPath)) {
        showNotification('Item is already in trash.', 'error');
        return null;
      }

      const fs = await getFileSystem();
      if (!fs.moveFile) {
        showNotification('Move to trash is not supported in this environment.', 'error');
        return null;
      }

      const { trashRootPath } = await withErrorHandling(
        () => ensureTrashRootDirectory(fs, rootPath),
        'Failed to create trash directory'
      );

      const relativePath = getRelativePathFromRoot(file.path, rootPath);
      const parentRelativePath = getParentRelativePath(relativePath);
      const containerName = createTrashContainerName(parentRelativePath);
      const containerPath = joinPath(trashRootPath, containerName);

      await withErrorHandling(
        () => fs.createDirectory(containerPath),
        'Failed to prepare trash container'
      );

      const movedPath = await withErrorHandling(
        () => fs.moveFile!(file.path, containerPath),
        'Failed to move item to trash'
      );

      await refreshFileTree();
      showNotification('Moved to trash', 'success');
      return movedPath;
    } catch (error) {
      handleFileSystemError(error, 'Failed to move item to trash');
      return null;
    }
  }, [showNotification, refreshFileTree, handleFileSystemError]);

  /**
   * Restore a file/folder from trash to original location
   */
  const restoreFromTrash = useCallback(async (file: FileNode): Promise<string | null> => {
    try {
      const rootPath = useAppStore.getState().rootFolderPath;
      if (!rootPath) {
        showNotification('No knowledge base opened. Please open one first.', 'error');
        return null;
      }

      const parsed = parseTrashPathInfo(file.path, rootPath);
      if (!parsed) {
        showNotification('Invalid trash item path.', 'error');
        return null;
      }

      const fs = await getFileSystem();
      if (!fs.moveFile) {
        showNotification('Restore from trash is not supported in this environment.', 'error');
        return null;
      }

      const targetParentRelative = getParentRelativePath(parsed.originalRelativePath);
      const targetParentPath = targetParentRelative
        ? joinPathSegments(rootPath, ...targetParentRelative.split('/').filter(Boolean))
        : rootPath;

      await withErrorHandling(
        () => fs.createDirectory(targetParentPath),
        'Failed to prepare restore target'
      );

      const targetPath = joinPath(targetParentPath, getPathBasename(file.path));
      const targetExists = await withErrorHandling(
        () => fs.fileExists(targetPath),
        'Failed to check restore target'
      );
      if (targetExists) {
        showNotification('Restore target already exists. Please rename or move the existing item first.', 'error');
        return null;
      }

      const restoredPath = await withErrorHandling(
        () => fs.moveFile!(file.path, targetParentPath),
        'Failed to restore item from trash'
      );

      const trashContainerPath = joinPath(joinPath(rootPath, parsed.trashDirName), parsed.containerName);
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

      await refreshFileTree();
      showNotification('Restored from trash', 'success');
      return restoredPath;
    } catch (error) {
      handleFileSystemError(error, 'Failed to restore item from trash');
      return null;
    }
  }, [showNotification, refreshFileTree, handleFileSystemError]);

  /**
   * Move a file to a new folder
   */
  const moveFile = useCallback(async (sourceFile: FileNode, targetFolderPath: string): Promise<string | null> => {
    try {
      const fs = await getFileSystem();
      const newPath = await withErrorHandling(
        () => fs.moveFile(sourceFile.path, targetFolderPath),
        'Failed to move file'
      );
      return newPath;
    } catch (error) {
      handleFileSystemError(error, 'Failed to move file');
      return null;
    }
  }, [handleFileSystemError]);

  /**
   * Check if file has unsaved changes
   */
  const hasUnsavedChanges = useCallback((fileId: string): boolean => {
    const state = useAppStore.getState();
    const content = state.fileContents[fileId];
    if (content === undefined) return false;
    return state.hasUnsavedChanges(fileId);
  }, []);

  /**
   * Watch file for changes (Tauri only)
   */
  const watchFile = useCallback(async (path: string, callback: (event: any) => void): Promise<(() => void) | null> => {
    try {
      const fs = await getFileSystem();
      if (typeof fs.watchFile === 'function') {
        return await fs.watchFile(path, callback);
      }
      return null;
    } catch (error) {
      console.error('Failed to watch file:', error);
      return null;
    }
  }, []);

  return {
    files,
    refreshFileTree,
    openFile,
    openDirectory,
    openKnowledgeBase,
    readFile,
    writeFile,
    writeBinaryFile,
    saveFile,
    createFile,
    createFolder,
    renameFile,
    deleteFile,
    moveToTrash,
    restoreFromTrash,
    moveFile,
    revealInExplorer,
    hasUnsavedChanges,
    watchFile,
  };
}
