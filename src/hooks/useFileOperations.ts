import { useCallback } from 'react';
import { basename } from '@tauri-apps/api/path';
import { useAppStore } from '../store/appStore';
import { useFileSystem } from './useFileSystem';
import type { FileNode } from '../types';
import * as yaml from 'js-yaml';

function findFileInTree(nodes: FileNode[], id: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findFileInTree(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function isSameOrChildPath(path: string, parentPath: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedParent = parentPath.replace(/\\/g, '/');
  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}/`);
}

function collectAffectedOpenTabIds(files: FileNode[], openTabs: string[], target: FileNode): string[] {
  return openTabs.filter((tabId) => {
    const node = findFileInTree(files, tabId);
    return node?.type === 'file' && isSameOrChildPath(node.path, target.path);
  });
}

/**
 * Encapsulates all file CRUD and drag-and-drop operations from App.tsx.
 */
export function useFileOperations() {
  const {
    files,
    activeTabId,
    fileContents,
    openTabs,
    settings,
    addTab,
    closeTab,
    updateTabContent,
    setCurrentFilePath,
    showNotification,
  } = useAppStore();

  const {
    readFile,
    createFile,
    createFolder,
    renameFile,
    deleteFile,
    moveToTrash,
    restoreFromTrash,
    moveFile,
    revealInExplorer,
  } = useFileSystem();

  const handleFileSelect = useCallback(async (file: FileNode) => {
    if (file.type === 'folder') return;

    try {
      const cachedContent = fileContents[file.id];
      addTab(file.id);
      setCurrentFilePath(file.path);

      if (cachedContent === undefined) {
        const text = await readFile(file);
        updateTabContent(file.id, text);
      }
    } catch (e) {
      console.error('Failed to read file:', file.path, e);
      showNotification(`Failed to read file: ${file.name}`, 'error');
    }
  }, [readFile, addTab, setCurrentFilePath, updateTabContent, showNotification, fileContents]);

  const handleCreateFile = useCallback(async (parentFolder?: FileNode) => {
    const timestamp = Date.now();
    const fileName = `note-${timestamp}.md`;
    const now = new Date().toISOString().split('T')[0];
    const meta: Record<string, unknown> = {};

    const parseDefaultValue = (val: string): unknown => {
      if (val === '{now}') return now;
      if (val === '[]') return [];
      if (val === '{}') return {};
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
      const num = Number(val);
      if (!isNaN(num) && val.trim() !== '') return num;
      return val;
    };

    settings.metadataFields.forEach(f => {
      meta[f.key] = parseDefaultValue(f.defaultValue);
    });

    let initialContent = '';
    try {
      initialContent = `---\n${yaml.dump(meta)}---\n\n# Untitled\n\n`;
    } catch {
      initialContent = `# Untitled\n\n`;
    }

    const newFile = await createFile(fileName, initialContent, parentFolder?.path);
    if (newFile) {
      addTab(newFile.id, initialContent);
      setCurrentFilePath(newFile.path);
    }
  }, [settings.metadataFields, createFile, addTab, setCurrentFilePath]);

  const handleRename = useCallback(async (file: FileNode, newName: string) => {
    try {
      const newPath = await renameFile(file, newName);
      if (newPath && activeTabId === file.id) {
        setCurrentFilePath(newPath);
      }
    } catch {
      showNotification('Rename failed', 'error');
    }
  }, [renameFile, activeTabId, setCurrentFilePath, showNotification]);

  const handleMoveToTrash = useCallback(async (file: FileNode) => {
    const movedPath = await moveToTrash(file);
    if (!movedPath) return;

    const affectedTabIds = collectAffectedOpenTabIds(files, openTabs, file);
    affectedTabIds.forEach((tabId) => closeTab(tabId));
  }, [moveToTrash, files, openTabs, closeTab]);

  const handleRestoreFromTrash = useCallback(async (file: FileNode) => {
    await restoreFromTrash(file);
  }, [restoreFromTrash]);

  const handleDeleteForever = useCallback(async (file: FileNode) => {
    try {
      const affectedTabIds = collectAffectedOpenTabIds(files, openTabs, file);
      await deleteFile(file);
      affectedTabIds.forEach((tabId) => closeTab(tabId));
      showNotification('Permanently deleted.', 'success');
    } catch {
      showNotification('Failed to delete file.', 'error');
    }
  }, [files, openTabs, deleteFile, closeTab, showNotification]);

  const handleMoveNode = useCallback(async (sourceId: string, targetId: string) => {
    const sourceFile = findFileInTree(files, sourceId);
    const targetFolder = findFileInTree(files, targetId);

    if (!sourceFile || !targetFolder || targetFolder.type !== 'folder') {
      showNotification('Can only move files to folders', 'error');
      return;
    }
    if (sourceFile.type !== 'file') {
      showNotification('Only files can be moved for now', 'error');
      return;
    }
    if (sourceId === targetId) return;

    try {
      const fileName = await basename(sourceFile.path);
      const newPath = await moveFile(sourceFile, targetFolder.path);
      if (newPath) {
        useAppStore.getState().updateFileName(sourceId, fileName, newPath);
        showNotification('File moved', 'success');
      }
    } catch (e) {
      console.error('Failed to move file:', e);
      showNotification('Failed to move file', 'error');
    }
  }, [files, moveFile, showNotification]);

  const handleNewFolder = useCallback(async (parentFolder?: FileNode, name?: string) => {
    if (!name || !name.trim()) return;
    const newNode = await createFolder(name, parentFolder?.path);
    if (newNode) {
      showNotification('Folder created', 'success');
    }
  }, [createFolder, showNotification]);

  const handleRevealInExplorer = useCallback(async (path: string) => {
    try {
      await revealInExplorer(path);
    } catch (e) {
      console.error('Failed to reveal in explorer:', e);
      showNotification('Failed to reveal in explorer', 'error');
    }
  }, [revealInExplorer, showNotification]);

  const handleOpenInFileExplorer = useCallback(async (file: FileNode) => {
    try {
      await revealInExplorer(file.path);
      showNotification('Opened file location in explorer', 'success');
    } catch (error) {
      console.error('Failed to open in file explorer:', error);
      showNotification('Failed to open in file explorer', 'error');
    }
  }, [revealInExplorer, showNotification]);

  const handleDelete = useCallback(async (file: FileNode) => {
    try {
      const affectedTabIds = collectAffectedOpenTabIds(files, openTabs, file);
      await deleteFile(file);
      affectedTabIds.forEach((tabId) => closeTab(tabId));
      showNotification('Deleted', 'success');
    } catch {
      showNotification('Failed to delete file.', 'error');
    }
  }, [files, openTabs, deleteFile, closeTab, showNotification]);

  return {
    handleFileSelect,
    handleCreateFile,
    handleRename,
    handleMoveToTrash,
    handleRestoreFromTrash,
    handleDeleteForever,
    handleDelete,
    handleMoveNode,
    handleNewFolder,
    handleRevealInExplorer,
    handleOpenInFileExplorer,
  };
}
