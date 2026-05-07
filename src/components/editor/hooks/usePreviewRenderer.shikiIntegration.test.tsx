/** @vitest-environment happy-dom */

import React, { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { usePreviewRenderer } from './usePreviewRenderer';
import * as shikiSnapshots from '../preview/shikiHtmlSnapshots';

// Some markdown utilities rely on Vite global defines.
(globalThis as any).__PROD__ ??= false;

vi.mock('../../../utils/previewImageCache', async () => {
  return {
    resolvePreviewSource: vi.fn(async (src: string) => src),
    warmPreviewImage: vi.fn(async (src: string) => src),
  };
});

function Harness(props: { html: string }) {
  const renderer = usePreviewRenderer({
    content: props.html,
    currentFilePath: '/vault/note.md',
    isMarkdownPreview: false,
    isHtmlPreview: true,
    highlighter: null,
    themeMode: 'light',
    files: [],
    rootFolderPath: '/vault',
    fileContents: {},
    activeTabId: 'tab',
    readFile: async () => '',
  });

  const [html, setHtml] = useState(() => renderer.enhancedBodyHtml);

  useEffect(() => {
    setHtml(renderer.enhancedBodyHtml);
  }, [renderer.enhancedBodyHtml]);

  return <div data-testid="out" dangerouslySetInnerHTML={{ __html: html }} />;
}

describe('usePreviewRenderer (Shiki protect/restore integration)', () => {
  it('restores Shiki <pre> blocks after async enhancement readback', async () => {
    const shikiPre = [
      '<pre class="shiki markdown-press-light" style="background-color:#f8fafc"><code>',
      '<span style="color:#C2410C">const</span>',
      '</code></pre>',
    ].join('');

    // Includes <img> to ensure async enhancement path runs.
    const html = `<section><p>before</p>${shikiPre}<img src="data:image/png;base64,AA==" /><p>after</p></section>`;

    render(<Harness html={html} />);

    await waitFor(() => {
      const out = screen.getByTestId('out');
      expect(out.innerHTML).toContain('<pre class="shiki');
      expect(out.innerHTML).toContain('color:#C2410C');
      expect(out.innerHTML).not.toContain('data-mp-shiki-slot=');
    });
  });
});

