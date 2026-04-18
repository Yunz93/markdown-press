import type { FileNode } from '../../types';
import { sanitizeTrashFolder } from '../../utils/trashFolder';
import { joinFsPath } from '../../utils/pathHelpers';

interface OpenKnowledgeBaseOptions {
  path?: string;
  silentSuccess?: boolean;
  skipSampleNotes?: boolean;
}

interface OpenKnowledgeBaseParams {
  addTab: (tabId: string, content: string) => void;
  clearAllCache: () => void;
  findPreferredFile: (fileNodes: FileNode[], filePath: string) => FileNode | undefined;
  findInitialOpenableFile: (fileNodes: FileNode[]) => FileNode | null;
  fs: {
    copySampleNotes?: (targetDir: string) => Promise<boolean>;
    openDirectory: () => Promise<string | null>;
    readDirectory: (dirPath: string) => Promise<FileNode[]>;
    readFile: (path: string) => Promise<string>;
  };
  hasOpenedKnowledgeBaseBefore: (path: string) => boolean;
  handleInitialFileError: (error: unknown) => void;
  initializeSampleNotes: (targetDir: string) => Promise<boolean>;
  lastOpenedFilePath: string | null;
  options?: OpenKnowledgeBaseOptions;
  registerAllowedPath: (path: string, recursive: boolean) => Promise<void>;
  registerAllowedPathIfExists: (path: string, recursive: boolean) => Promise<void>;
  setCurrentFilePath: (path: string | null) => void;
  setFiles: (files: FileNode[]) => void;
  setRootFolderPath: (path: string | null) => void;
  trashFolder: string;
  withErrorHandling: <T>(fn: () => Promise<T>, context: string) => Promise<T>;
}

interface OpenKnowledgeBaseResult {
  dirPath: string;
  fileNodes: FileNode[];
  initialFile: FileNode | null;
  openedPreviewOnly: boolean;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(`${context} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

function isPreviewOnlyFile(name: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp|pdf|html?)$/i.test(name);
}

export async function openKnowledgeBaseWorkspace(
  params: OpenKnowledgeBaseParams
): Promise<OpenKnowledgeBaseResult | null> {
  const {
    addTab,
    clearAllCache,
    findPreferredFile,
    findInitialOpenableFile,
    fs,
    hasOpenedKnowledgeBaseBefore,
    handleInitialFileError,
    initializeSampleNotes,
    lastOpenedFilePath,
    options,
    registerAllowedPath,
    registerAllowedPathIfExists,
    setCurrentFilePath,
    setFiles,
    setRootFolderPath,
    trashFolder,
    withErrorHandling,
  } = params;

  const dirPath = options?.path || await fs.openDirectory();
  if (!dirPath) return null;

  try {
    await withTimeout(
      registerAllowedPath(dirPath, true),
      5000,
      'Register allowed path'
    );
  } catch (error) {
    console.warn('Failed to register allowed path (continuing):', error);
  }

  const trashRootPath = joinFsPath(dirPath, sanitizeTrashFolder(trashFolder));
  try {
    await withTimeout(
      registerAllowedPathIfExists(trashRootPath, true),
      3000,
      'Register trash path'
    );
  } catch (error) {
    console.warn('Failed to register trash path (continuing):', error);
  }

  const shouldInitializeSampleNotes =
    !options?.skipSampleNotes &&
    !!fs.copySampleNotes &&
    !hasOpenedKnowledgeBaseBefore(dirPath);

  if (shouldInitializeSampleNotes) {
    await initializeSampleNotes(dirPath);
  }

  const fileNodes = await withErrorHandling(
    () => fs.readDirectory(dirPath),
    'Failed to read knowledge base'
  );

  clearAllCache();
  setCurrentFilePath(null);
  setFiles(fileNodes);
  setRootFolderPath(dirPath);

  const preferredInitialFile = lastOpenedFilePath
    ? findPreferredFile(fileNodes, lastOpenedFilePath)
    : undefined;
  const initialFile = preferredInitialFile ?? findInitialOpenableFile(fileNodes);

  let openedPreviewOnly = false;
  if (initialFile) {
    try {
      const initialContent = await withErrorHandling(
        () => fs.readFile(initialFile.path),
        `Failed to read file: ${initialFile.name}`
      );

      addTab(initialFile.id, initialContent);
      setCurrentFilePath(initialFile.path);
      openedPreviewOnly = isPreviewOnlyFile(initialFile.name) && !isMarkdownFile(initialFile.name);
    } catch (error) {
      handleInitialFileError(error);
    }
  }

  return {
    dirPath,
    fileNodes,
    initialFile,
    openedPreviewOnly,
  };
}
