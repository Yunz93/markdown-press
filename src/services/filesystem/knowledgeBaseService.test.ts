import { describe, expect, it, vi } from 'vitest';
import type { FileNode } from '../../types';
import { openKnowledgeBaseWorkspace } from './knowledgeBaseService';

function createFileNode(path: string, name: string): FileNode {
  return {
    id: path,
    path,
    name,
    type: 'file',
  };
}

function createBaseParams(overrides: Partial<Parameters<typeof openKnowledgeBaseWorkspace>[0]> = {}) {
  const fileNodes = [createFileNode('/vault/note.md', 'note.md')];

  return {
    addTab: vi.fn(),
    clearAllCache: vi.fn(),
    findPreferredFile: vi.fn((_nodes: FileNode[], filePath: string) => fileNodes.find((node) => node.path === filePath)),
    findInitialOpenableFile: vi.fn((nodes: FileNode[]) => nodes[0] ?? null),
    fs: {
      copySampleNotes: vi.fn(),
      fileExists: vi.fn(async () => true),
      openDirectory: vi.fn(async () => '/selected'),
      readDirectory: vi.fn(async () => fileNodes),
      readFile: vi.fn(async () => '# note'),
    },
    hasOpenedKnowledgeBaseBefore: vi.fn(() => true),
    handleInitialFileError: vi.fn(),
    initializeSampleNotes: vi.fn(async () => false),
    lastOpenedFilePath: null,
    options: {
      path: '/vault',
      skipSampleNotes: true,
    },
    registerAllowedPath: vi.fn(async () => undefined),
    registerAllowedPathIfExists: vi.fn(async () => undefined),
    setCurrentFilePath: vi.fn(),
    setFiles: vi.fn(),
    setRootFolderPath: vi.fn(),
    trashFolder: '.trash',
    withErrorHandling: async <T>(fn: () => Promise<T>) => fn(),
    ...overrides,
  };
}

describe('openKnowledgeBaseWorkspace', () => {
  it('opens an existing knowledge base path after registering fs scope', async () => {
    const params = createBaseParams();

    const result = await openKnowledgeBaseWorkspace(params);

    expect(params.registerAllowedPath).toHaveBeenCalledWith('/vault', true);
    expect(params.fs.fileExists).toHaveBeenCalledWith('/vault');
    expect(params.fs.readDirectory).toHaveBeenCalledWith('/vault');
    expect(params.setRootFolderPath).toHaveBeenCalledWith('/vault');
    expect(params.addTab).toHaveBeenCalledWith('/vault/note.md', '# note');
    expect(result?.dirPath).toBe('/vault');
  });

  it('returns null for a missing restored knowledge base path', async () => {
    const params = createBaseParams({
      fs: {
        copySampleNotes: vi.fn(),
        fileExists: vi.fn(async () => false),
        openDirectory: vi.fn(async () => '/selected'),
        readDirectory: vi.fn(async () => [createFileNode('/vault/note.md', 'note.md')]),
        readFile: vi.fn(async () => '# note'),
      },
    });

    const result = await openKnowledgeBaseWorkspace(params);

    expect(params.registerAllowedPath).toHaveBeenCalledWith('/vault', true);
    expect(params.fs.fileExists).toHaveBeenCalledWith('/vault');
    expect(params.registerAllowedPathIfExists).not.toHaveBeenCalled();
    expect(params.fs.readDirectory).not.toHaveBeenCalled();
    expect(params.setFiles).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('continues opening when fileExists is unavailable', async () => {
    const params = createBaseParams({
      fs: {
        copySampleNotes: vi.fn(),
        openDirectory: vi.fn(async () => '/selected'),
        readDirectory: vi.fn(async () => [createFileNode('/vault/note.md', 'note.md')]),
        readFile: vi.fn(async () => '# note'),
      },
    });

    const result = await openKnowledgeBaseWorkspace(params);

    expect(params.registerAllowedPath).toHaveBeenCalledWith('/vault', true);
    expect(params.fs.readDirectory).toHaveBeenCalledWith('/vault');
    expect(result?.dirPath).toBe('/vault');
  });

  it('opens a restored PDF preview without reading it as text', async () => {
    const pdfNodes = [createFileNode('/vault/archive.pdf', 'archive.pdf')];
    const params = createBaseParams({
      findPreferredFile: vi.fn((_nodes: FileNode[], filePath: string) => pdfNodes.find((node) => node.path === filePath)),
      lastOpenedFilePath: '/vault/archive.pdf',
      fs: {
        copySampleNotes: vi.fn(),
        fileExists: vi.fn(async () => true),
        openDirectory: vi.fn(async () => '/selected'),
        readDirectory: vi.fn(async () => pdfNodes),
        readFile: vi.fn(async () => {
          throw new Error('PDF should not be read as text');
        }),
      },
    });

    const result = await openKnowledgeBaseWorkspace(params);

    expect(params.fs.readFile).not.toHaveBeenCalled();
    expect(params.addTab).toHaveBeenCalledWith('/vault/archive.pdf');
    expect(params.setCurrentFilePath).toHaveBeenCalledWith('/vault/archive.pdf');
    expect(result?.openedPreviewOnly).toBe(true);
  });

  it('opens a restored image preview without reading it as text', async () => {
    const imageNodes = [createFileNode('/vault/poster.png', 'poster.png')];
    const params = createBaseParams({
      findPreferredFile: vi.fn((_nodes: FileNode[], filePath: string) => imageNodes.find((node) => node.path === filePath)),
      lastOpenedFilePath: '/vault/poster.png',
      fs: {
        copySampleNotes: vi.fn(),
        fileExists: vi.fn(async () => true),
        openDirectory: vi.fn(async () => '/selected'),
        readDirectory: vi.fn(async () => imageNodes),
        readFile: vi.fn(async () => {
          throw new Error('Image should not be read as text');
        }),
      },
    });

    const result = await openKnowledgeBaseWorkspace(params);

    expect(params.fs.readFile).not.toHaveBeenCalled();
    expect(params.addTab).toHaveBeenCalledWith('/vault/poster.png');
    expect(result?.openedPreviewOnly).toBe(true);
  });

  it('reads restored HTML into the tab and marks preview-only on success', async () => {
    const htmlNodes = [createFileNode('/vault/page.html', 'page.html')];
    const params = createBaseParams({
      findPreferredFile: vi.fn((_nodes: FileNode[], filePath: string) => htmlNodes.find((node) => node.path === filePath)),
      lastOpenedFilePath: '/vault/page.html',
      fs: {
        copySampleNotes: vi.fn(),
        fileExists: vi.fn(async () => true),
        openDirectory: vi.fn(async () => '/selected'),
        readDirectory: vi.fn(async () => htmlNodes),
        readFile: vi.fn(async () => '<p>hello</p>'),
      },
    });

    const result = await openKnowledgeBaseWorkspace(params);

    expect(params.fs.readFile).toHaveBeenCalledWith('/vault/page.html');
    expect(params.addTab).toHaveBeenCalledWith('/vault/page.html', '<p>hello</p>');
    expect(result?.openedPreviewOnly).toBe(true);
  });

  it('does not mark preview-only when the initial HTML read fails', async () => {
    const htmlNodes = [createFileNode('/vault/page.html', 'page.html')];
    const params = createBaseParams({
      findPreferredFile: vi.fn((_nodes: FileNode[], filePath: string) => htmlNodes.find((node) => node.path === filePath)),
      lastOpenedFilePath: '/vault/page.html',
      fs: {
        copySampleNotes: vi.fn(),
        fileExists: vi.fn(async () => true),
        openDirectory: vi.fn(async () => '/selected'),
        readDirectory: vi.fn(async () => htmlNodes),
        readFile: vi.fn(async () => {
          throw new Error('read failed');
        }),
      },
    });

    const result = await openKnowledgeBaseWorkspace(params);

    expect(params.addTab).not.toHaveBeenCalled();
    expect(params.setCurrentFilePath).not.toHaveBeenCalledWith('/vault/page.html');
    expect(params.handleInitialFileError).toHaveBeenCalled();
    expect(result?.openedPreviewOnly).toBe(false);
  });
});
