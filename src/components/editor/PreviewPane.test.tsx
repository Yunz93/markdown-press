/** @vitest-environment happy-dom */

import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const markdownExtensionMocks = vi.hoisted(() => ({
  renderMermaidDiagrams: vi.fn(async () => {}),
  resetMermaidPlaceholders: vi.fn(),
}));

const previewHtml = Array.from({ length: 25 }, (_, index) => (
  `<div class="mermaid">flowchart LR\nA${index}-->B${index}</div>`
)).join('');

vi.mock('../../store/appStore', () => {
  const state = {
    settings: {
      themeMode: 'light',
      previewFontFamily: 'preview-font',
      codeFontFamily: 'code-font',
      fontSize: 16,
    },
    currentFilePath: '/notes/diagram.md',
    rootFolderPath: '/notes',
    files: [],
    showNotification: vi.fn(),
    activeTabId: 'tab-1',
    content: '# diagram',
  };

  return {
    selectContent: (appState: typeof state) => appState.content,
    useAppStore: (selector?: (appState: typeof state) => unknown) => (
      typeof selector === 'function' ? selector(state) : state
    ),
  };
});

vi.mock('../../hooks/useFileOperations', () => ({
  useFileOperations: () => ({
    handleFileSelect: vi.fn(),
    handleRevealInExplorer: vi.fn(),
  }),
}));

vi.mock('../../hooks/useFileSystem', () => ({
  useFileSystem: () => ({
    readFile: vi.fn(),
  }),
}));

vi.mock('../../utils/markdown-extensions', () => ({
  renderMermaidDiagrams: markdownExtensionMocks.renderMermaidDiagrams,
  resetMermaidPlaceholders: markdownExtensionMocks.resetMermaidPlaceholders,
}));

vi.mock('./hooks', () => ({
  usePreviewRenderer: () => ({
    parsedContent: {
      frontmatter: null,
      bodyHTML: previewHtml,
    },
    enhancedBodyHtml: previewHtml,
    sanitizedHtmlPreview: previewHtml,
    requiresAsyncEnhancement: false,
  }),
  usePreviewScroll: () => ({
    cancelScrollSync: vi.fn(),
    syncScrollTo: vi.fn(),
    flushPendingScrollSync: vi.fn(),
    handleScroll: vi.fn(),
  }),
  useWikiLinkNavigation: () => ({
    registerPane: vi.fn(),
    unregisterPane: vi.fn(),
    clearScrollRetries: vi.fn(),
    navigateToWikilink: vi.fn(),
    navigateToHashLink: vi.fn(),
  }),
}));

import { PreviewPane } from './PreviewPane';

describe('PreviewPane', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    markdownExtensionMocks.renderMermaidDiagrams.mockClear();
    markdownExtensionMocks.resetMermaidPlaceholders.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);

    if (!('ResizeObserver' in globalThis)) {
      class ResizeObserverMock {
        observe() {}
        disconnect() {}
      }
      vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    }

    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('still renders Mermaid when more than 20 diagrams are present', async () => {
    await act(async () => {
      root.render(<PreviewPane />);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(markdownExtensionMocks.renderMermaidDiagrams).toHaveBeenCalled();

    const calls = markdownExtensionMocks.renderMermaidDiagrams.mock.calls as unknown[][];
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();

    const previewContainer = firstCall?.[0];
    expect(previewContainer).toBeInstanceOf(HTMLElement);
    if (!(previewContainer instanceof HTMLElement)) {
      throw new Error('Expected PreviewPane to pass its preview container to Mermaid rendering.');
    }
    expect(previewContainer.querySelectorAll('.mermaid')).toHaveLength(25);
  });
});
