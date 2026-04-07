import { useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { useFileSystem } from './useFileSystem';
import { ViewMode, type FileNode } from '../types';
import { generateFrontmatter } from '../utils/frontmatter';
import { parseMetadataTemplateValue } from '../utils/metadataFields';

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

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return '';
  return normalized.slice(0, idx);
}

function buildMovedPathMap(sourceNode: FileNode, newRootPath: string): Record<string, string> {
  const pathMap: Record<string, string> = {};
  const sourceRootPath = sourceNode.path;

  const visit = (node: FileNode) => {
    const suffix = node.path.slice(sourceRootPath.length);
    pathMap[node.path] = `${newRootPath}${suffix}`;
    node.children?.forEach(visit);
  };

  visit(sourceNode);
  return pathMap;
}

function remapRecordKeys<T>(record: Record<string, T>, remapPath: (path: string) => string): Record<string, T> {
  const nextRecord: Record<string, T> = {};

  for (const [key, value] of Object.entries(record)) {
    nextRecord[remapPath(key)] = value;
  }

  return nextRecord;
}

function isImageFile(name: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(name);
}

function isPdfFile(name: string): boolean {
  return /\.pdf$/i.test(name);
}

function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

function isHtmlFile(name: string): boolean {
  return /\.html?$/i.test(name);
}

function isPreviewOnlyFile(name: string): boolean {
  return isImageFile(name) || isPdfFile(name) || isHtmlFile(name);
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
    rootFolderPath,
    fileContents,
    openTabs,
    settings,
    addTab,
    closeTab,
    updateTabContent,
    setCurrentFilePath,
    setViewMode,
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
    refreshFileTree,
    revealInExplorer,
  } = useFileSystem();

  const handleFileSelect = useCallback(async (file: FileNode) => {
    if (file.type === 'folder') return;

    try {
      if (!isMarkdownFile(file.name) && !isPreviewOnlyFile(file.name)) {
        showNotification(`Preview is not supported for ${file.name}`, 'error');
        return;
      }

      addTab(file.id);
      setCurrentFilePath(file.path);

      if (isPreviewOnlyFile(file.name)) {
        if (isHtmlFile(file.name)) {
          const text = await readFile(file);
          updateTabContent(file.id, text);
        } else {
          updateTabContent(file.id, '');
        }
        setViewMode(ViewMode.PREVIEW);
        return;
      }

      const cachedContent = fileContents[file.id];

      if (cachedContent === undefined) {
        const text = await readFile(file);
        updateTabContent(file.id, text);
      }
    } catch (e) {
      console.error('Failed to read file:', file.path, e);
      showNotification(`Failed to read file: ${file.name}`, 'error');
    }
  }, [readFile, addTab, setCurrentFilePath, setViewMode, updateTabContent, showNotification, fileContents]);

  const handleCreateFile = useCallback(async (parentFolder?: FileNode, fileName?: string) => {
    const timestamp = Date.now();
    const normalizedName = (fileName?.trim() || `note-${timestamp}`).replace(/\.md$/i, '');
    const finalFileName = `${normalizedName}.md`;
    const documentTitle = normalizedName;
    const meta: Record<string, string | string[] | number | boolean> = {};

    settings.metadataFields.forEach(f => {
      meta[f.key] = parseMetadataTemplateValue(f.defaultValue);
    });

    const frontmatterBlock = Object.keys(meta).length > 0 ? generateFrontmatter(meta) : '';
    const initialContent = `${frontmatterBlock}# ${documentTitle}\n\n`;

    const newFile = await createFile(finalFileName, initialContent, parentFolder?.path);
    if (newFile) {
      addTab(newFile.id, initialContent);
      setCurrentFilePath(newFile.path);
    }
  }, [settings.metadataFields, createFile, addTab, setCurrentFilePath]);

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

  const handleEmptyTrash = useCallback(async (trashItems: FileNode[]) => {
    if (trashItems.length === 0) {
      showNotification('Trash is already empty.', 'success');
      return;
    }

    try {
      const affectedTabIds = new Set<string>();
      trashItems.forEach((item) => {
        collectAffectedOpenTabIds(files, openTabs, item).forEach((tabId) => affectedTabIds.add(tabId));
      });

      for (const item of trashItems) {
        await deleteFile(item);
      }

      affectedTabIds.forEach((tabId) => closeTab(tabId));
      showNotification('Trash emptied.', 'success');
    } catch {
      showNotification('Failed to empty trash.', 'error');
    }
  }, [files, openTabs, deleteFile, closeTab, showNotification]);

  const remapPathReferencesAfterMove = useCallback((pathMap: Record<string, string>) => {
    useAppStore.setState((state) => {
      const remapPath = (path: string): string => pathMap[path] ?? path;

      const remappedOpenTabs = state.openTabs.map(remapPath);
      const nextOpenTabs = remappedOpenTabs.filter((tabId, index) => remappedOpenTabs.indexOf(tabId) === index);
      const nextActiveTabId = state.activeTabId ? remapPath(state.activeTabId) : null;
      const validatedActiveTabId = nextActiveTabId && nextOpenTabs.includes(nextActiveTabId)
        ? nextActiveTabId
        : (nextOpenTabs[0] ?? null);

      return {
        openTabs: nextOpenTabs,
        activeTabId: validatedActiveTabId,
        currentFilePath: state.currentFilePath ? remapPath(state.currentFilePath) : null,
        fileContents: remapRecordKeys(state.fileContents, remapPath),
        lastSavedContent: remapRecordKeys(state.lastSavedContent, remapPath),
        fileHistories: remapRecordKeys(state.fileHistories, remapPath),
      };
    });
  }, []);

  const handleRename = useCallback(async (file: FileNode, newName: string) => {
    try {
      const newPath = await renameFile(file, newName);
      if (!newPath || newPath === file.path) return;

      remapPathReferencesAfterMove(buildMovedPathMap(file, newPath));
    } catch {
      showNotification('Rename failed', 'error');
    }
  }, [renameFile, remapPathReferencesAfterMove, showNotification]);

  const moveNodeToTargetPath = useCallback(async (sourceNode: FileNode, targetPath: string) => {
    const normalizedTargetPath = normalizePath(targetPath);
    const normalizedSourceParent = normalizePath(getParentPath(sourceNode.path));

    if (!normalizedTargetPath) {
      showNotification('Invalid target folder', 'error');
      return;
    }

    if (normalizedTargetPath === normalizedSourceParent) {
      return;
    }

    if (sourceNode.type === 'folder' && isSameOrChildPath(targetPath, sourceNode.path)) {
      showNotification('Cannot move a folder into itself', 'error');
      return;
    }

    if (sourceNode.isTrash) {
      showNotification('Cannot move trash items from this area', 'error');
      return;
    }

    try {
      const newPath = await moveFile(sourceNode, targetPath);
      if (!newPath) return;

      remapPathReferencesAfterMove(buildMovedPathMap(sourceNode, newPath));
      await refreshFileTree();
      showNotification(sourceNode.type === 'folder' ? 'Folder moved' : 'File moved', 'success');
    } catch (e) {
      console.error('Failed to move item:', e);
      showNotification(sourceNode.type === 'folder' ? 'Failed to move folder' : 'Failed to move file', 'error');
    }
  }, [moveFile, refreshFileTree, remapPathReferencesAfterMove, showNotification]);

  const handleMoveNode = useCallback(async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceNode = findFileInTree(files, sourceId);
    const targetNode = findFileInTree(files, targetId);

    if (!sourceNode || !targetNode) {
      showNotification('Move target not found', 'error');
      return;
    }

    if (targetNode.isTrash) {
      showNotification('Cannot move items into trash directly', 'error');
      return;
    }

    const targetPath = targetNode.type === 'folder'
      ? targetNode.path
      : (getParentPath(targetNode.path) || rootFolderPath);

    if (!targetPath) {
      showNotification('Target folder not found', 'error');
      return;
    }

    await moveNodeToTargetPath(sourceNode, targetPath);
  }, [files, moveNodeToTargetPath, rootFolderPath, showNotification]);

  const handleMoveToRoot = useCallback(async (sourceId: string) => {
    if (!rootFolderPath) {
      showNotification('No knowledge base opened.', 'error');
      return;
    }

    const sourceNode = findFileInTree(files, sourceId);
    if (!sourceNode) {
      showNotification('Item not found', 'error');
      return;
    }

    await moveNodeToTargetPath(sourceNode, rootFolderPath);
  }, [files, rootFolderPath, moveNodeToTargetPath, showNotification]);

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
    handleEmptyTrash,
    handleDelete,
    handleMoveNode,
    handleMoveToRoot,
    handleNewFolder,
    handleRevealInExplorer,
    handleOpenInFileExplorer,
  };
}
