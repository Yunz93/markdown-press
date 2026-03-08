import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, exists, mkdir, readDir, rename, remove } from '@tauri-apps/plugin-fs';
import { basename, dirname, join } from '@tauri-apps/api/path';
import type { FileNode } from '../types';
import type { IFileSystem } from '../types/filesystem';

/**
 * Supported file extensions
 */
const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
const CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml', '.toml'];

type LineEnding = '\n' | '\r\n';

interface FileFormatState {
  lineEnding: LineEnding;
  hasBom: boolean;
  lastContent: string;
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
  private fileFormatStates: Map<string, FileFormatState> = new Map();

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

  private captureFileFormat(path: string, raw: string): string {
    const hasBom = raw.startsWith('\uFEFF');
    const content = hasBom ? raw.slice(1) : raw;
    const lineEnding: LineEnding = content.includes('\r\n') ? '\r\n' : '\n';

    this.fileFormatStates.set(path, {
      lineEnding,
      hasBom,
      lastContent: content
    });

    return content;
  }

  private prepareContentForWrite(path: string, content: string): string {
    const format = this.fileFormatStates.get(path);
    const defaultLineEnding: LineEnding =
      typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('win')
        ? '\r\n'
        : (content.includes('\r\n') ? '\r\n' : '\n');
    const targetLineEnding = format?.lineEnding ?? defaultLineEnding;
    let normalized = content;

    if (targetLineEnding === '\r\n') {
      normalized = normalized.replace(/\r?\n/g, '\r\n');
    } else {
      normalized = normalized.replace(/\r\n/g, '\n');
    }

    if (format?.hasBom) {
      if (!normalized.startsWith('\uFEFF')) {
        normalized = `\uFEFF${normalized}`;
      }
    } else if (normalized.startsWith('\uFEFF')) {
      normalized = normalized.slice(1);
    }

    return normalized;
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
      const raw = await readTextFile(path);
      return this.captureFileFormat(path, raw);
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
      const prepared = this.prepareContentForWrite(path, content);
      await writeTextFile(path, prepared);
      this.captureFileFormat(path, prepared);
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
          const prepared = this.prepareContentForWrite(savePath, content);
          await writeTextFile(savePath, prepared);
          this.captureFileFormat(savePath, prepared);
          return savePath;
        }
        return null;
      }
      const prepared = this.prepareContentForWrite(path, content);
      await writeTextFile(path, prepared);
      this.captureFileFormat(path, prepared);
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
      const format = this.fileFormatStates.get(oldPath);
      if (format) {
        this.fileFormatStates.set(newPath, format);
        this.fileFormatStates.delete(oldPath);
      }
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
      const fileName = await basename(sourcePath);
      const destPath = await join(targetPath, fileName);
      await rename(sourcePath, destPath);
      const format = this.fileFormatStates.get(sourcePath);
      if (format) {
        this.fileFormatStates.set(destPath, format);
        this.fileFormatStates.delete(sourcePath);
      }
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
      this.fileFormatStates.delete(path);
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
        const escapedPath = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const cmd = Command.create('osascript', [
          '-e',
          `tell application "Finder" to reveal POSIX file "${escapedPath}"`,
          '-e',
          'tell application "Finder" to activate'
        ]);
        await cmd.execute();
      } else if (isWin) {
        // Windows: Use explorer /select
        const cmd = Command.create('explorer', ['/select,', path]);
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
  async readDirectory(dirPath: string, _rootPath: string = dirPath): Promise<FileNode[]> {
    try {
      const entries = await readDir(dirPath);
      const nodes: FileNode[] = [];

      for (const entry of entries) {
        if (!entry.name) continue;
        if (!this.showHiddenFiles && entry.name.startsWith('.')) continue;

        const fullPath = await join(dirPath, entry.name);
        const ext = entry.name.toLowerCase();

        if (entry.isDirectory) {
          const children = await this.readDirectory(fullPath, _rootPath);
          nodes.push({
            id: fullPath,
            name: entry.name,
            type: 'folder',
            path: fullPath,
            children,
            isTrash: false
          });
        }
        // Check if it's a markdown file
        else if (MARKDOWN_EXTENSIONS.some(e => ext.endsWith(e))) {
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
      const prepared = this.prepareContentForWrite(path, content);
      await writeTextFile(path, prepared);
      this.captureFileFormat(path, prepared);
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
      let previous = this.fileFormatStates.get(path)?.lastContent;

      if (previous === undefined) {
        try {
          const initialRaw = await readTextFile(path);
          previous = this.captureFileFormat(path, initialRaw);
        } catch {
          previous = '';
        }
      }

      const timer = window.setInterval(async () => {
        try {
          const latestKnown = this.fileFormatStates.get(path)?.lastContent;
          if (latestKnown !== undefined) {
            previous = latestKnown;
          }

          const currentRaw = await readTextFile(path);
          const current = this.captureFileFormat(path, currentRaw);

          if (current !== previous) {
            previous = current;
            callback({ path, type: 'modified' });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
          const isMissingFile = message.includes('not found') || message.includes('no such file');
          if (isMissingFile) {
            callback({ path, type: 'deleted' });
            window.clearInterval(timer);
            return;
          }
          callback({ path, type: 'error', error });
        }
      }, 1500);

      return () => {
        window.clearInterval(timer);
      };
    } catch (error) {
      console.error('Failed to watch file:', error);
      return () => {};
    }
  }
}

// Export singleton instance for convenience
export const fileSystem = TauriFileSystem.getInstance();
