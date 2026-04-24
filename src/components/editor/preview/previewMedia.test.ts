/** @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import { createPreviewPdfContainer } from './previewMedia';

describe('PDF preview helpers', () => {
  it('creates PDF.js preview containers for live DOM rendering', () => {
    const container = createPreviewPdfContainer(document, 'blob:test-pdf', 'Sample PDF', '/vault/Sample PDF.pdf');

    expect(container.classList.contains('preview-attachment-pdf')).toBe(true);
    expect(container.classList.contains('preview-pdfjs')).toBe(true);
    expect(container.dataset.pdfSrc).toBe('blob:test-pdf');
    expect(container.dataset.pdfTitle).toBe('Sample PDF');
    expect(container.dataset.pdfPath).toBe('/vault/Sample PDF.pdf');
    expect(container.dataset.pdfjsState).toBe('pending');
    expect(container.textContent).toBe('Loading PDF...');
  });
});
