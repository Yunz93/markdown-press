import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, exists, mkdir, readDir, rename, remove } from '@tauri-apps/plugin-fs';
import { dirname, join } from '@tauri-apps/api/path';
import { listen } from '@tauri-apps/api/event';
import type { FileNode } from '../types';
import type { IFileSystem } from '../types/filesystem';

/**
 * Supported file extensions
 */
const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
const CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml', '.toml'];

/**
 * Check if a file should be shown in the file tree
 */
function shouldShowFile(name: string, showHidden: boolean = false): boolean {
  // Hide hidden files unless explicitly shown
  if (!showHidden && name.startsWith('.')) {
    return false;
  }

  const ext = name.toLowerCase();
  return (
    MARKDOWN_EXTENSIONS.some(e => ext.endsWith(e)) ||
    IMAGE_EXTENSIONS.some(e => ext.endsWith(e)) ||
    CONFIG_EXTENSIONS.some(e => ext.endsWith(e))
  );
}

/**
 * Pure Tauri FileSystem implementation
 * Uses native Tauri FS and Dialog plugins for all file operations
 */
export class TauriFileSystem implements IFileSystem {
  private static instance: TauriFileSystem;
  private showHiddenFiles: boolean = false;
  private showImages: boolean = true;
  private showConfigFiles: boolean = false;

  static getInstance(): TauriFileSystem {
    if (!TauriFileSystem.instance) {
      TauriFileSystem.instance = new TauriFileSystem();
    }
    return TauriFileSystem.instance;
  }

  /**
   * Configure which files to show
   */
  setDisplayOptions(options: { showHidden?: boolean; showImages?: boolean; showConfigFiles?: boolean }): void {
    if (options.showHidden !== undefined) this.showHiddenFiles = options.showHidden;
    if (options.showImages !== undefined) this.showImages = options.showImages;
    if (options.showConfigFiles !== undefined) this.showConfigFiles = options.showConfigFiles;
  }

  /**
   * Open a single markdown file
   */
  async openFile(): Promise<string | null> {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      });
      return (selected as string) || null;
    } catch (error) {
      console.error('Failed to open file:', error);
      return null;
    }
  }

  /**
   * Open a directory and return the path
   */
  async openDirectory(): Promise<string | null> {
    try {
      const selected = await open({
        directory: true,
        multiple: false
      });
      return (selected as string) || null;
    } catch (error) {
      console.error('Failed to open directory:', error);
      return null;
    }
  }

  /**
   * Read a text file
   */
  async readFile(path: string): Promise<string> {
    try {
      return await readTextFile(path);
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
      await writeTextFile(path, content);
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
        const savePath = await save({
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        });
        if (savePath) {
          await writeTextFile(savePath, content);
          return savePath;
        }
        return null;
      }
      await writeTextFile(path, content);
      return path;
    } catch (error) {
      console.error('Failed to save file:', error);
      throw error;
    }
  }

  /**
   * Rename a file
   */
  async renameFile(oldPath: string, newName: string): Promise<string> {
    try {
      const dir = await dirname(oldPath);
      const nameWithExt = newName.endsWith('.md') ? newName : `${newName}.md`;
      const newPath = await join(dir, nameWithExt);
      await rename(oldPath, newPath);
      return newPath;
    } catch (error) {
      console.error('Failed to rename file:', error);
      throw error;
    }
  }

  /**
   * Move a file to a new location
   */
  async moveFile(sourcePath: string, targetPath: string): Promise<string> {
    try {
      const { basename } = await import('@tauri-apps/api/path');
      const fileName = await basename(sourcePath);
      const destPath = await join(targetPath, fileName);
      await rename(sourcePath, destPath);
      return destPath;
    } catch (error) {
      console.error('Failed to move file:', error);
      throw error;
    }
  }

  /**
   * Delete a file or directory
   */
  async deleteFile(path: string): Promise<void> {
    try {
      await remove(path, { recursive: true });
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  /**
   * Reveal file in system explorer
   */
  async revealInExplorer(path: string): Promise<void> {
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      // Use osascript to tell Finder to reveal the file on macOS
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const isWin = navigator.platform.toLowerCase().includes('win');

      if (isMac) {
        // macOS: Use AppleScript to reveal in Finder
        const cmd = Command.create('osascript', [
          '-e',
          `tell application "Finder" to reveal POSIX file "${path}"`,
          '-e',
          'tell application "Finder" to activate'
        ]);
        await cmd.execute();
      } else if (isWin) {
        // Windows: Use explorer /select
        const cmd = Command.create('explorer', [`/select,${path}`]);
        await cmd.execute();
      } else {
        // Linux: Open the containing folder
        const cmd = Command.create('xdg-open', [await dirname(path)]);
        await cmd.execute();
      }
    } catch (error) {
      console.error('Failed to reveal in explorer:', error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(path: string): Promise<boolean> {
    try {
      return await exists(path);
    } catch (error) {
      console.error(`Failed to check if file exists ${path}:`, error);
      return false;
    }
  }

  /**
   * Recursively read directory and return file nodes
   */
  async readDirectory(dirPath: string, rootPath: string = dirPath): Promise<FileNode[]> {
    try {
      const entries = await readDir(dirPath);
      const nodes: FileNode[] = [];

      for (const entry of entries) {
        const fullPath = await join(dirPath, entry.name);
        const ext = entry.name.toLowerCase();

        // Check if it's a markdown file
        if (MARKDOWN_EXTENSIONS.some(e => ext.endsWith(e))) {
          nodes.push({
            id: fullPath,
            name: entry.name,
            type: 'file',
            path: fullPath,
            isTrash: false
          });
        }
        // Check if it's an image file
        else if (this.showImages && IMAGE_EXTENSIONS.some(e => ext.endsWith(e))) {
          nodes.push({
            id: fullPath,
            name: entry.name,
            type: 'file',
            path: fullPath,
            isTrash: false
          });
        }
        // Check if it's a config file
        else if (this.showConfigFiles && CONFIG_EXTENSIONS.some(e => ext.endsWith(e))) {
          nodes.push({
            id: fullPath,
            name: entry.name,
            type: 'file',
            path: fullPath,
            isTrash: false
          });
        }
        // Check if it's a directory (and not hidden unless shown)
        else if (entry.isDirectory && (this.showHiddenFiles || !entry.name.startsWith('.'))) {
          const children = await this.readDirectory(fullPath, rootPath);
          if (children.length > 0) {
            nodes.push({
              id: fullPath,
              name: entry.name,
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
      await writeTextFile(path, content);
      return path;
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
      await mkdir(path, { recursive: true });
    } catch (error) {
      console.error('Failed to create directory:', error);
      throw error;
    }
  }

  /**
   * Listen to file system events
   */
  async watchFile(path: string, callback: (event: any) => void): Promise<() => void> {
    try {
      // Note: Tauri 2.x file watcher requires the watcher plugin
      // For now, we'll return a no-op unlisten function
      const unlisten = await listen('file-changed', callback);
      return unlisten;
    } catch (error) {
      console.error('Failed to watch file:', error);
      return () => {};
    }
  }
}

// Export singleton instance for convenience
export const fileSystem = TauriFileSystem.getInstance();