/**
 * Image Paste Hook
 * 
 * 处理编辑器中的图片粘贴功能
 */

import { useCallback } from 'react';
import type { EditorView } from '@codemirror/view';
import type { AttachmentPasteFormat } from '../../../types';
import { getFileSystem } from '../../../types/filesystem';
import { useAppStore } from '../../../store/appStore';
import { t } from '../../../utils/i18n';

export interface UseImagePasteOptions {
  rootFolderPath?: string | null;
  currentFilePath?: string | null;
  resourceFolder?: string;
  attachmentPasteFormat?: AttachmentPasteFormat;
  writeBinaryFile: (path: string, data: Uint8Array) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export interface UseImagePasteReturn {
  handlePastedImage: (file: File, view: EditorView) => Promise<boolean>;
}

function getPathSeparator(path: string): '/' | '\\' {
  return path.includes('\\') ? '\\' : '/';
}

function joinFsPath(basePath: string, ...segments: string[]): string {
  return segments.filter(Boolean).reduce((currentPath, segment) => {
    const separator = getPathSeparator(currentPath);
    return currentPath.endsWith(separator)
      ? `${currentPath}${segment}`
      : `${currentPath}${separator}${segment}`;
  }, basePath);
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

function sanitizeResourceFolder(folder: string): string {
  return folder
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^\.\//, '');
}

function getImageExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'image/bmp':
      return 'bmp';
    case 'image/avif':
      return 'avif';
    default:
      return 'png';
  }
}

function buildPastedImageMarkdown(path: string, format: AttachmentPasteFormat): string {
  if (format === 'markdown') {
    const fileName = path.split('/').filter(Boolean).pop() || 'image';
    const altText = fileName.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '\\$&');
    return `![${altText}](<${path}>)`;
  }

  return `![[${path}]]`;
}

export function useImagePaste(options: UseImagePasteOptions): UseImagePasteReturn {
  const {
    rootFolderPath,
    currentFilePath,
    resourceFolder = 'resources',
    attachmentPasteFormat = 'obsidian',
    writeBinaryFile,
    refreshFileTree,
    showNotification,
  } = options;

  const handlePastedImage = useCallback(async (file: File, view: EditorView): Promise<boolean> => {
    const language = useAppStore.getState().settings.language;
    if (!rootFolderPath) {
      showNotification(t(language, 'notifications_openKnowledgeBaseBeforePastingImage'), 'error');
      return false;
    }

    try {
      const sanitizedResourceFolder = sanitizeResourceFolder(resourceFolder) || 'resources';
      const targetDir = joinFsPath(rootFolderPath, sanitizedResourceFolder);
      const extension = getImageExtension(file.type);
      const noteBaseName = currentFilePath?.split(/[\\/]/).pop()?.replace(/\.(md|markdown)$/i, '') || 'image';
      const imageName = `${noteBaseName}-${Date.now()}.${extension}`;
      const imagePath = joinFsPath(targetDir, imageName);
      const imageMarkdownPath = normalizeSlashes(joinFsPath(sanitizedResourceFolder, imageName));
      const arrayBuffer = await file.arrayBuffer();

      const fileSystem = await getFileSystem();
      await fileSystem.createDirectory(targetDir);
      await writeBinaryFile(imagePath, new Uint8Array(arrayBuffer));
      await refreshFileTree();

      const insertText = buildPastedImageMarkdown(imageMarkdownPath, attachmentPasteFormat);
      const selection = view.state.selection.main;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: insertText },
        selection: { anchor: selection.from + insertText.length },
        scrollIntoView: true,
      });

      showNotification(t(language, 'notifications_imagePastedTo', { folder: sanitizedResourceFolder }), 'success');
      return true;
    } catch (error) {
      console.error('Failed to paste image attachment:', error);
      showNotification(t(language, 'notifications_pasteImageFailed'), 'error');
      return false;
    }
  }, [rootFolderPath, currentFilePath, resourceFolder, attachmentPasteFormat, writeBinaryFile, refreshFileTree, showNotification]);

  return { handlePastedImage };
}
