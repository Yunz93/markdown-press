import type { FileNode } from '../types';

/**
 * Unified file system interface
 * Implementations: TauriFileSystem (for Tauri app), BrowserFileSystem (for web)
 */
export interface IFileSystem {
  openFile(): Promise<string | null>;
  openDirectory(): Promise<string | null>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  writeBinaryFile?(path: string, content: Uint8Array): Promise<void>;
  getFileObjectUrl?(path: string): Promise<string>;
  saveFile(path: string | null, content: string): Promise<string | null>;
  renameFile(oldPath: string, newName: string): Promise<string>;
  renameEntry?(oldPath: string, newName: string, isDirectory: boolean): Promise<string>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  readDirectory(dirPath: string, rootPath?: string): Promise<FileNode[]>;
  createFile(path: string, content?: string): Promise<string>;
  createDirectory(path: string): Promise<void>;
  revealInExplorer?(path: string): Promise<void>;
  moveFile?(sourcePath: string, targetPath: string): Promise<string>;
  watchFile?(path: string, callback: (event: any) => void): Promise<() => void>;
}

/**
 * Check if running in Tauri environment
 * Supports both Tauri 1.x (__TAURI__) and Tauri 2.x (__TAURI_INTERNALS__)
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for Tauri 2.x
  if ('__TAURI_INTERNALS__' in window) return true;

  // Check for Tauri 1.x
  if ('__TAURI__' in window) return true;

  // Check for Tauri APIs directly
  if ((window as any).__TAURI_INTERNALS__?.plugins) return true;

  return false;
}

/**
 * Wait for Tauri environment to be ready
 * Use this when you need to ensure Tauri APIs are available
 * This is useful in build mode where Tauri injection might be delayed
 */
export function waitForTauri(maxWaitMs: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (isTauriEnvironment()) {
      resolve(true);
      return;
    }

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (isTauriEnvironment()) {
        clearInterval(checkInterval);
        resolve(true);
        return;
      }

      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
}

/**
 * Get the appropriate file system based on environment
 * @throws Error if no supported file system is available
 */
export async function getFileSystem(): Promise<IFileSystem> {
  // Check Tauri first
  if (isTauriEnvironment()) {
    const { TauriFileSystem } = await import('../services/tauriFileSystem');
    return TauriFileSystem.getInstance();
  }

  // Then check for File System Access API (browser)
  if (isFileSystemAccessSupported()) {
    const { BrowserFileSystem } = await import('../services/browserFileSystem');
    return BrowserFileSystem.getInstance();
  }

  throw new Error(
    'No supported file system available. Please use Tauri or a browser with File System Access API support.'
  );
}
