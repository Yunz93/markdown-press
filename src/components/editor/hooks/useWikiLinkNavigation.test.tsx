/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FileNode } from '../../../types';
import { useWikiLinkNavigation } from './useWikiLinkNavigation';

vi.mock('../../../store/appStore', () => ({
  useAppStore: {
    getState: () => ({ settings: { language: 'zh' } }),
  },
}));

const mockRequestPreviewHeadingScroll = vi.fn(() => false);

vi.mock('../../../utils/previewNavigationBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/previewNavigationBridge')>();
  return {
    ...actual,
    requestPreviewHeadingScroll: (...args: unknown[]) => mockRequestPreviewHeadingScroll(...args),
  };
});

const files: FileNode[] = [
  { id: 'note-a', name: 'a.md', type: 'file', path: '/vault/notes/a.md' },
];

function createHook(content = '# Title\n\n## Section\n\nParagraph') {
  const showNotification = vi.fn();
  const handleFileSelect = vi.fn(async () => {});

  const hook = renderHook(() => useWikiLinkNavigation({
    content,
    currentFilePath: '/vault/notes/a.md',
    rootFolderPath: '/vault',
    files,
    activeTabId: 'note-a',
    isMarkdownPreview: true,
    showNotification,
    handleFileSelect,
  }));

  const container = document.createElement('div');
  container.style.height = '400px';
  container.style.overflow = 'auto';
  container.innerHTML = `
    <article class="markdown-body">
      <h2 data-heading-id="section" data-heading-slug="section" data-heading-text="Section">Section</h2>
      <p data-block-id="block-id">Block paragraph</p>
    </article>
  `;
  document.body.appendChild(container);

  act(() => {
    hook.result.current.registerPane(container);
  });

  return { hook, container, showNotification, handleFileSelect };
}

describe('useWikiLinkNavigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('finds headings and block references inside the preview pane', () => {
    const { hook, container } = createHook();

    expect(hook.result.current.findHeadingElement(container, '#Section')).toBeTruthy();
    expect(hook.result.current.findBlockElement(container, '^block-id')).toBeTruthy();
  });

  it('scrolls to a heading hash link inside the current preview', () => {
    const { hook, container } = createHook();
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    act(() => {
      expect(hook.result.current.navigateToHashLink('#Section')).toBe(true);
    });

    expect(scrollTo).toHaveBeenCalled();
  });

  it('opens another note when the wikilink target resolves to a file', async () => {
    const { hook, handleFileSelect } = createHook();

    await act(async () => {
      await hook.result.current.navigateToWikilink('a');
    });

    expect(handleFileSelect).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/vault/notes/a.md', name: 'a.md' }),
    );
  });

  it('shows an error when a heading-only wikilink cannot be resolved', async () => {
    const { hook, showNotification } = createHook('# Title\n\nNo matching headings');

    await act(async () => {
      await hook.result.current.navigateToWikilink('#Missing Heading');
    });

    expect(showNotification).toHaveBeenCalled();
  });

  it('scrolls to block references via hash navigation', () => {
    const { hook, container } = createHook();
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    act(() => {
      expect(hook.result.current.navigateToHashLink('^block-id')).toBe(true);
    });

    expect(scrollTo).toHaveBeenCalled();
  });

  it('requests a cross-file heading scroll after opening another note', async () => {
    const filesWithOther: FileNode[] = [
      ...files,
      { id: 'note-b', name: 'b.md', type: 'file', path: '/vault/notes/b.md' },
    ];

    const showNotification = vi.fn();
    const handleFileSelect = vi.fn(async () => {});
    const hook = renderHook(() => useWikiLinkNavigation({
      content: '# Title',
      currentFilePath: '/vault/notes/a.md',
      rootFolderPath: '/vault',
      files: filesWithOther,
      activeTabId: 'note-a',
      isMarkdownPreview: true,
      showNotification,
      handleFileSelect,
    }));

    await act(async () => {
      await hook.result.current.navigateToWikilink('b#Section');
    });

    expect(handleFileSelect).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/vault/notes/b.md' }),
    );
    expect(mockRequestPreviewHeadingScroll).toHaveBeenCalledWith(
      'note-b',
      'Section',
      expect.objectContaining({ alignMode: 'center' }),
    );
  });
});
