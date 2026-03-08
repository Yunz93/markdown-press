import type { FileNode } from '../types';
import type { IFileSystem } from '../types/filesystem';

/**
 * Browser File System using File System Access API
 * Provides a fallback for non-Tauri environments
 */
export class BrowserFileSystem implements IFileSystem {
  private static instance: BrowserFileSystem;
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private fileHandles: Map<string, FileSystemFileHandle> = new Map();
  private rootPath: string = '';

  static getInstance(): BrowserFileSystem {
    if (!BrowserFileSystem.instance) {
      BrowserFileSystem.instance = new BrowserFileSystem();
    }
    return BrowserFileSystem.instance;
  }

  /**
   * Open a single markdown file
   */
  async openFile(): Promise<string | null> {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'Markdown Files',
          accept: { 'text/markdown': ['.md', '.markdown'] }
        }]
      });

      const file = await fileHandle.getFile();
      const id = `browser-${Date.now()}-${file.name}`;
      this.fileHandles.set(id, fileHandle);
      return id;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return null; // User cancelled
      }
      console.error('Failed to open file:', error);
      throw error;
    }
  }

  /**
   * Open a directory
   */
  async openDirectory(): Promise<string | null> {
    try {
      this.directoryHandle = await window.showDirectoryPicker();
      this.rootPath = `browser-dir-${Date.now()}`;
      return this.rootPath;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return null; // User cancelled
      }
      console.error('Failed to open directory:', error);
      throw error;
    }
  }

  /**
   * Read file content
   */
  async readFile(path: string): Promise<string> {
    try {
      // Check if it's a file handle path
      if (path.startsWith('browser-')) {
        const handle = this.fileHandles.get(path);
        if (handle) {
          const file = await handle.getFile();
          return await file.text();
        }
      }

      // Try to read from directory handle
      if (this.directoryHandle) {
        const relativePath = this.getRelativePath(path);
        const fileHandle = await this.getFileHandle(this.directoryHandle, relativePath);
        const file = await fileHandle.getFile();
        return await file.text();
      }

      throw new Error('File not found');
    } catch (error) {
      console.error(`Failed to read file ${path}:`, error);
      throw error;
    }
  }

  /**
   * Write content to a file
   */
  async writeFile(path: string, content: string): Promise<void> {
    try {
      let fileHandle: FileSystemFileHandle;

      // Check if it's a known file handle
      if (path.startsWith('browser-') && this.fileHandles.has(path)) {
        fileHandle = this.fileHandles.get(path)!;
      } else if (this.directoryHandle) {
        const relativePath = this.getRelativePath(path);
        fileHandle = await this.getFileHandle(this.directoryHandle, relativePath, true);
      } else {
        throw new Error('No file handle or directory available');
      }

      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } catch (error) {
      console.error(`Failed to write file ${path}:`, error);
      throw error;
    }
  }

  /**
   * Save file - shows save dialog if path is null
   */
  async saveFile(path: string | null, content: string): Promise<string | null> {
    try {
      if (!path) {
        const fileHandle = await window.showSaveFilePicker({
          types: [{
            description: 'Markdown Files',
            accept: { 'text/markdown': ['.md'] }
          }]
        });

        if (fileHandle) {
          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();

          const id = `browser-${Date.now()}-${fileHandle.name}`;
          this.fileHandles.set(id, fileHandle);
          return id;
        }
        return null;
      }

      await this.writeFile(path, content);
      return path;
    } catch (error) {
      console.error('Failed to save file:', error);
      throw error;
    }
  }

  /**
   * Rename a file (creates a new file with new name, deletes old)
   */
  async renameFile(oldPath: string, newName: string): Promise<string> {
    try {
      // Read old content
      const content = await this.readFile(oldPath);

      // Create new file with new name
      if (this.directoryHandle) {
        const oldRelativePath = this.getRelativePath(oldPath);
        const parentPath = oldRelativePath.substring(0, oldRelativePath.lastIndexOf('/'));
        const newRelativePath = parentPath ? `${parentPath}/${newName}` : newName;

        // Create new file
        const newHandle = await this.getFileHandle(this.directoryHandle, newRelativePath, true);
        const writable = await newHandle.createWritable();
        await writable.write(content);
        await writable.close();

        // Delete old file
        await this.deleteFile(oldPath);

        const newPath = this.rootPath ? `${this.rootPath}/${newRelativePath}` : newRelativePath;
        this.fileHandles.set(newPath, newHandle);
        return newPath;
      }

      throw new Error('Cannot rename without directory context');
    } catch (error) {
      console.error('Failed to rename file:', error);
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(path: string): Promise<void> {
    try {
      if (this.directoryHandle) {
        const relativePath = this.getRelativePath(path);
        const parentPath = relativePath.substring(0, relativePath.lastIndexOf('/'));
        const fileName = relativePath.substring(relativePath.lastIndexOf('/') + 1);

        const parentHandle = parentPath
          ? await this.getDirectoryHandle(this.directoryHandle, parentPath)
          : this.directoryHandle;

        await parentHandle.removeEntry(fileName);
      }

      this.fileHandles.delete(path);
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      if (this.fileHandles.has(path)) {
        return true;
      }

      if (this.directoryHandle) {
        const relativePath = this.getRelativePath(path);
        await this.getFileHandle(this.directoryHandle, relativePath);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Read directory and return file nodes
   */
  async readDirectory(dirPath: string, rootPath: string = dirPath): Promise<FileNode[]> {
    try {
      const dirHandle = dirPath === this.rootPath && this.directoryHandle
        ? this.directoryHandle
        : await this.getDirectoryHandle(this.directoryHandle!, this.getRelativePath(dirPath));

      const nodes: FileNode[] = [];

      for await (const [name, entry] of (dirHandle as any).entries()) {
        const fullPath = `${dirPath}/${name}`;

        if (entry.kind === 'file' && (name.endsWith('.md') || name.endsWith('.markdown'))) {
          nodes.push({
            id: fullPath,
            name,
            type: 'file',
            path: fullPath,
            isTrash: false
          });
        } else if (entry.kind === 'directory' && !name.startsWith('.')) {
          const children = await this.readDirectory(fullPath, rootPath);
          if (children.length > 0) {
            nodes.push({
              id: fullPath,
              name,
              type: 'folder',
              path: fullPath,
              children,
              isTrash: false
            });
          }
        }
      }

      return nodes;
    } catch (error) {
      console.error(`Failed to read directory ${dirPath}:`, error);
      return [];
    }
  }

  /**
   * Create a new file
   */
  async createFile(path: string, content: string = ''): Promise<string> {
    try {
      if (this.directoryHandle) {
        const relativePath = this.getRelativePath(path);
        const fileHandle = await this.getFileHandle(this.directoryHandle, relativePath, true);

        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();

        return path;
      }

      throw new Error('No directory opened');
    } catch (error) {
      console.error('Failed to create file:', error);
      throw error;
    }
  }

  /**
   * Create a new directory
   */
  async createDirectory(path: string): Promise<void> {
    try {
      if (this.directoryHandle) {
        const relativePath = this.getRelativePath(path);
        await this.getDirectoryHandle(this.directoryHandle, relativePath, true);
      }
    } catch (error) {
      console.error('Failed to create directory:', error);
      throw error;
    }
  }

  /**
   * Move a file (not implemented for browser)
   */
  async moveFile(sourcePath: string, targetPath: string): Promise<string> {
    throw new Error('Move operation not supported in browser');
  }

  // Helper methods

  private getRelativePath(path: string): string {
    if (path.startsWith(this.rootPath)) {
      return path.substring(this.rootPath.length + 1);
    }
    return path;
  }

  private async getFileHandle(
    dirHandle: FileSystemDirectoryHandle,
    path: string,
    create = false
  ): Promise<FileSystemFileHandle> {
    const parts = path.split('/').filter(Boolean);

    let currentHandle: FileSystemDirectoryHandle = dirHandle;

    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create });
    }

    return currentHandle.getFileHandle(parts[parts.length - 1], { create });
  }

  private async getDirectoryHandle(
    dirHandle: FileSystemDirectoryHandle,
    path: string,
    create = false
  ): Promise<FileSystemDirectoryHandle> {
    const parts = path.split('/').filter(Boolean);

    let currentHandle: FileSystemDirectoryHandle = dirHandle;

    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part, { create });
    }

    return currentHandle;
  }
}

// Add type declarations for File System Access API
declare global {
  interface Window {
    showOpenFilePicker(options?: {
      multiple?: boolean;
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: {
      types?: Array<{
        description?: string;
        accept: Record<string, string[]>;
      }>;
    }): Promise<FileSystemFileHandle>;
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
  }
}
