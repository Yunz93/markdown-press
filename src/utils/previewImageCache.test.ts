/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../types/filesystem', () => ({
  isTauriEnvironment: vi.fn(() => false),
  getFileSystem: vi.fn(async () => ({})),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn(async (path: string) => `asset://${path}`),
}));

vi.mock('@tauri-apps/api/path', () => ({
  dirname: vi.fn(async () => '/vault/notes'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
  normalize: vi.fn(async (path: string) => path),
}));

import { isTauriEnvironment } from '../types/filesystem';
import {
  getCachedPreviewImageSrc,
  hydrateCachedPreviewImageSources,
  resolvePreviewSource,
  warmPreviewImage,
} from './previewImageCache';

describe('resolvePreviewSource', () => {
  beforeEach(() => {
    vi.mocked(isTauriEnvironment).mockReturnValue(false);
  });

  it('returns data and blob urls unchanged', async () => {
    await expect(resolvePreviewSource('data:image/png;base64,abc')).resolves.toBe('data:image/png;base64,abc');
    await expect(resolvePreviewSource('blob:abc')).resolves.toBe('blob:abc');
  });

  it('resolves relative image paths against the current note location in browser mode', async () => {
    const resolved = await resolvePreviewSource('../img/poster.png', '/vault/notes/a.md');
    expect(resolved).toContain('img/poster.png');
  });
});

describe('hydrateCachedPreviewImageSources', () => {
  it('returns html unchanged when there are no images', () => {
    expect(hydrateCachedPreviewImageSources('<p>plain</p>', '/vault/a.md')).toBe('<p>plain</p>');
  });

  it('leaves html unchanged when no warmed cache entry exists', () => {
    const html = '<img src="poster.png" data-original-src="poster.png" />';
    expect(hydrateCachedPreviewImageSources(html, '/vault/a.md')).toBe(html);
    expect(getCachedPreviewImageSrc('poster.png', '/vault/a.md')).toBeNull();
  });
});

describe('warmPreviewImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to resolved source when blob fetch is unavailable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(warmPreviewImage('assets/poster.png', '/vault/notes/a.md')).resolves.toContain('poster.png');
    expect(getCachedPreviewImageSrc('assets/poster.png', '/vault/notes/a.md')).toContain('poster.png');

    fetchSpy.mockRestore();
  });

  it('stores blob urls when fetch succeeds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['image-bytes'], { type: 'image/png' }),
    } as Response);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cached-image');

    await expect(warmPreviewImage('assets/remote.png', '/vault/notes/a.md')).resolves.toBe('blob:cached-image');
    expect(getCachedPreviewImageSrc('assets/remote.png', '/vault/notes/a.md')).toBe('blob:cached-image');

    fetchSpy.mockRestore();
    createObjectURL.mockRestore();
  });
});

describe('resolvePreviewSource environment branches', () => {
  beforeEach(async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(false);
    const { getFileSystem } = await import('../types/filesystem');
    vi.mocked(getFileSystem).mockResolvedValue({} as never);
  });

  it('resolves file:// paths through the filesystem object url helper', async () => {
    const { getFileSystem } = await import('../types/filesystem');
    vi.mocked(getFileSystem).mockResolvedValue({
      getFileObjectUrl: vi.fn(async (path: string) => `object:${path}`),
    } as never);

    await expect(resolvePreviewSource('file:///vault/img/poster.png')).resolves.toBe('object:/vault/img/poster.png');
  });

  it('converts relative paths with tauri convertFileSrc when running in tauri', async () => {
    vi.mocked(isTauriEnvironment).mockReturnValue(true);

    await expect(resolvePreviewSource('img/poster.png', '/vault/notes/a.md')).resolves.toBe('asset:///vault/notes/img/poster.png');
  });
});

describe('hydrateCachedPreviewImageSources cache hits', () => {
  it('rewrites img src when a warmed cache entry exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await warmPreviewImage('assets/poster.png', '/vault/notes/a.md');

    const html = hydrateCachedPreviewImageSources(
      '<img src="assets/poster.png" data-original-src="assets/poster.png" />',
      '/vault/notes/a.md',
    );

    expect(html).toContain('assets/poster.png');
    expect(html).not.toBe('<img src="assets/poster.png" data-original-src="assets/poster.png" />');

    fetchSpy.mockRestore();
  });
});
