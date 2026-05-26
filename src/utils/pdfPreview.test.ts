/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPdfPreview } from './pdfPreview';

const mockRender = vi.fn(() => ({
  promise: Promise.resolve(undefined),
  cancel: vi.fn(),
}));

const mockPdf = {
  numPages: 2,
  getPage: vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: mockRender,
  })),
  destroy: vi.fn(),
};

vi.mock('pdfjs-dist/legacy/build/pdf.mjs?url', () => ({ default: 'worker.js' }));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  VerbosityLevel: { ERRORS: 0 },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve(mockPdf),
    destroy: vi.fn(),
  })),
}));

vi.mock('../types/filesystem', () => ({
  getFileSystem: vi.fn(async () => ({
    readBinaryFile: vi.fn(async () => new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])),
  })),
}));

describe('mountPdfPreview', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('mounts virtual pdf pages and marks the container ready', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 720 });
    document.body.appendChild(container);

    const cleanup = mountPdfPreview(container, 'blob:pdf', 'Paper', '/vault/paper.pdf');
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.preview-pdfjs-page').length).toBe(2);
    });
    expect(['ready', 'rendered']).toContain(container.dataset.pdfjsState);
    cleanup();
  });

  it('shows an error state when pdf bytes are invalid', async () => {
    const { getFileSystem } = await import('../types/filesystem');
    vi.mocked(getFileSystem).mockResolvedValue({
      readBinaryFile: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
    } as never);

    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 720 });
    document.body.appendChild(container);

    const cleanup = mountPdfPreview(container, 'blob:bad', 'Bad', '/vault/bad.pdf');
    await vi.waitFor(() => {
      expect(container.dataset.pdfjsState).toBe('error');
    });

    expect(container.textContent).toContain('Failed to render PDF preview.');
    cleanup();
  });
});
