import { useCallback } from 'react';
import { TauriFileSystem } from '../services/tauriFileSystem';
import { getFileSystem, isTauriEnvironment } from '../types/filesystem';
import { useAppStore } from '../store/appStore';
import { withErrorHandling, FileSystemError } from '../utils/errorHandler';
import type { FileNode } from '../types';

/**
 * Hook for file system operations
 * Automatically selects the appropriate file system implementation based on environment
 */
export function useFileSystem() {
  const {
    files,
    setFiles,
    setContent,
    setActiveTab,
    setCurrentFilePath,
    setRootFolderPath,
    updateFileContent,
    showNotification,
    addTab,
    fileContents
  } = useAppStore();

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
        const { basename } = await import('@tauri-apps/api/path').catch(() => ({
          basename: (p: string) => p.split('/').pop() || p
        }));

        const content = await withErrorHandling(
          () => fs.readFile(path),
          'Failed to read file'
        );
        const fileName = await basename(path);

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
   * Open a directory
   */
  const openDirectory = useCallback(async () => {
    try {
      const fs = await getFileSystem();
      const dirPath = await fs.openDirectory();
      if (dirPath) {
        const fileNodes = await withErrorHandling(
          () => fs.readDirectory(dirPath),
          'Failed to read directory'
        );
        setFiles(fileNodes);
        setRootFolderPath(dirPath);
        showNotification('Folder opened successfully', 'success');
      }
    } catch (error) {
      handleFileSystemError(error, 'Failed to open folder');
    }
  }, [setFiles, setRootFolderPath, showNotification, handleFileSystemError]);

  /**
   * Read a file
   */
  const readFile = useCallback(async (file: FileNode): Promise<string> => {
    return withErrorHandling(
      async () => {
        console.log('Reading file:', file.path, 'type:', file.type);
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
      const { join } = await import('@tauri-apps/api/path').catch(() => ({
        join: (...parts: string[]) => parts.join('/')
      }));
      const basePath = folderPath || useAppStore.getState().rootFolderPath;
      if (!basePath) {
        showNotification('No folder opened. Please open a folder first.', 'error');
        return null;
      }

      const fullPath = await join(basePath, fileName);
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
      const { join } = await import('@tauri-apps/api/path').catch(() => ({
        join: (...parts: string[]) => parts.join('/')
      }));
      const basePath = parentPath || useAppStore.getState().rootFolderPath;
      if (!basePath) {
        showNotification('No folder opened. Please open a folder first.', 'error');
        return null;
      }

      const fullPath = await join(basePath, folderName);
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
        () => fs.renameFile(file.path, newName),
        'Failed to rename file'
      );
      if (newPath) {
        useAppStore.getState().updateFileName(file.id, newName.endsWith('.md') ? newName : `${newName}.md`, newPath);
      }
      return newPath;
    } catch (error) {
      handleFileSystemError(error, 'Failed to rename file');
      return null;
    }
  }, [handleFileSystemError]);

  /**
   * Delete a file
   */
  const deleteFile = useCallback(async (file: FileNode): Promise<void> => {
    try {
      const fs = await getFileSystem();
      await withErrorHandling(
        () => fs.deleteFile(file.path),
        'Failed to delete file'
      );
      useAppStore.getState().removeFile(file.id);
    } catch (error) {
      handleFileSystemError(error, 'Failed to delete file');
      throw error; // Re-throw to let caller handle it
    }
  }, [handleFileSystemError]);

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
      if (isTauriEnvironment()) {
        return await TauriFileSystem.getInstance().watchFile(path, callback);
      }
      return null;
    } catch (error) {
      console.error('Failed to watch file:', error);
      return null;
    }
  }, []);

  return {
    files,
    openFile,
    openDirectory,
    readFile,
    writeFile,
    saveFile,
    createFile,
    createFolder,
    renameFile,
    deleteFile,
    moveFile,
    revealInExplorer,
    hasUnsavedChanges,
    watchFile,
  };
}
