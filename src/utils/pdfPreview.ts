import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getFileSystem } from '../types/filesystem';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

const MAX_CANVAS_WIDTH = 980;
const RESIZE_EPSILON_PX = 24;
const PDF_LOAD_TIMEOUT_MS = 15000;
const PDF_RENDER_TIMEOUT_MS = 20000;

interface PageShell {
  pageNumber: number;
  element: HTMLElement;
  width: number;
  height: number;
}

let pdfjsPromise: Promise<typeof PdfJs> | null = null;

async function loadPdfJs(): Promise<typeof PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function getRenderWidth(container: HTMLElement): number {
  const measuredWidth = container.clientWidth || container.getBoundingClientRect().width || MAX_CANVAS_WIDTH;
  return Math.max(280, Math.min(MAX_CANVAS_WIDTH, Math.floor(measuredWidth)));
}

function createStatus(message: string, className = 'preview-pdfjs-status'): HTMLElement {
  const status = document.createElement('div');
  status.className = className;
  status.textContent = message;
  return status;
}

function createFallbackLink(src: string, title: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'preview-attachment-pdf-fallback-link';
  link.href = src;
  link.textContent = title;
  return link;
}

function createPagePlaceholder(pageNumber: number, totalPages: number): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.className = 'preview-pdfjs-page-placeholder';
  placeholder.textContent = `Page ${pageNumber} / ${totalPages}`;
  return placeholder;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function assertPdfData(data: Uint8Array): void {
  const headerLength = Math.min(data.length, 1024);
  let header = '';
  for (let index = 0; index < headerLength; index += 1) {
    header += String.fromCharCode(data[index]);
  }
  if (!header.includes('%PDF-')) {
    throw new Error('Loaded file bytes do not contain a PDF header.');
  }
}

async function readPdfData(src: string, path?: string): Promise<Uint8Array> {
  let data: Uint8Array;
  if (path) {
    const fs = await getFileSystem();
    if (typeof fs.readBinaryFile === 'function') {
      data = await fs.readBinaryFile(path);
      assertPdfData(data);
      return data;
    }
  }

  const response = await fetch(src, {
    cache: 'force-cache',
    credentials: /^https?:\/\//i.test(src) ? 'omit' : 'same-origin',
    mode: /^https?:\/\//i.test(src) ? 'cors' : 'same-origin',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) {
    throw new Error(`Failed to load PDF bytes: ${response.status}`);
  }
  data = new Uint8Array(await response.arrayBuffer());
  assertPdfData(data);
  return data;
}

export function mountPdfPreview(container: HTMLElement, src: string, title: string, path?: string): () => void {
  let cancelled = false;
  let pdf: PDFDocumentProxy | null = null;
  let loadingTask: PDFDocumentLoadingTask | null = null;
  let activeRenderTask: RenderTask | null = null;
  let activePageNumber = 0;
  let lastRenderedWidth = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let documentRun = 0;
  let pageRenderRun = 0;
  let observer: IntersectionObserver | null = null;
  const pageShells = new Map<number, PageShell>();
  const visibleRatios = new Map<number, number>();

  const applyPageShellSize = (shell: PageShell, renderWidth: number) => {
    const pageWidth = Math.floor(renderWidth);
    const pageHeight = Math.max(180, Math.floor((shell.height / shell.width) * pageWidth));
    shell.element.style.width = `${pageWidth}px`;
    shell.element.style.minHeight = `${pageHeight}px`;
  };

  const clearPageContent = (pageNumber: number) => {
    const shell = pageShells.get(pageNumber);
    if (!shell) return;
    shell.element.classList.remove('is-rendered');
    shell.element.replaceChildren(createPagePlaceholder(pageNumber, pdf?.numPages ?? pageShells.size));
  };

  const clearOtherRenderedPages = (keepPageNumber: number) => {
    for (const pageNumber of pageShells.keys()) {
      if (pageNumber !== keepPageNumber) {
        clearPageContent(pageNumber);
      }
    }
  };

  const renderPage = async (pageNumber: number, force = false) => {
    if (!pdf || cancelled) return;

    const shell = pageShells.get(pageNumber);
    if (!shell) return;

    const renderWidth = getRenderWidth(container);
    if (!force && activePageNumber === pageNumber && shell.element.querySelector('canvas')) {
      return;
    }

    const runId = pageRenderRun += 1;
    activePageNumber = pageNumber;
    container.dataset.pdfjsState = 'loading-page';

    try {
      activeRenderTask?.cancel();
      activeRenderTask = null;
      clearOtherRenderedPages(pageNumber);
      shell.element.classList.add('is-rendering');
      shell.element.replaceChildren(createStatus(`Loading page ${pageNumber}...`));

      const page = await pdf.getPage(pageNumber);
      if (cancelled || runId !== pageRenderRun) return;

      const unitViewport = page.getViewport({ scale: 1 });
      shell.width = unitViewport.width;
      shell.height = unitViewport.height;

      const cssScale = renderWidth / unitViewport.width;
      const viewport = page.getViewport({ scale: cssScale });
      const outputScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      applyPageShellSize(shell, renderWidth);

      const canvas = document.createElement('canvas');
      canvas.className = 'preview-pdfjs-canvas';
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas 2D context is unavailable.');
      }

      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      activeRenderTask = page.render({
        canvas,
        viewport,
        canvasContext: context,
      });
      await withTimeout(activeRenderTask.promise, PDF_RENDER_TIMEOUT_MS, `Rendering PDF page ${pageNumber}`);
      activeRenderTask = null;

      if (cancelled || runId !== pageRenderRun) return;
      shell.element.classList.remove('is-rendering');
      shell.element.classList.add('is-rendered');
      shell.element.replaceChildren(canvas);
      container.dataset.pdfjsState = 'rendered';
      lastRenderedWidth = renderWidth;
    } catch (error) {
      if (cancelled || runId !== pageRenderRun) return;
      console.warn('Failed to render PDF preview:', error);
      container.dataset.pdfjsState = 'error';
      container.replaceChildren(
        createStatus('Failed to render PDF preview.', 'preview-pdfjs-status preview-pdfjs-error'),
        createFallbackLink(src, title),
      );
    }
  };

  const renderMostVisiblePage = () => {
    let nextPageNumber = activePageNumber || 1;
    let maxRatio = -1;

    for (const [pageNumber, ratio] of visibleRatios.entries()) {
      if (ratio > maxRatio) {
        nextPageNumber = pageNumber;
        maxRatio = ratio;
      }
    }

    void renderPage(nextPageNumber);
  };

  const updatePageShellSizes = () => {
    const renderWidth = getRenderWidth(container);
    for (const shell of pageShells.values()) {
      applyPageShellSize(shell, renderWidth);
    }
  };

  const buildVirtualPages = async () => {
    const runId = documentRun += 1;
    const renderWidth = getRenderWidth(container);

    container.dataset.pdfjsState = 'loading';
    container.dataset.pdfjsSrc = src;
    container.replaceChildren(createStatus('Loading PDF...'));

    try {
      const pdfjs = await withTimeout(loadPdfJs(), PDF_LOAD_TIMEOUT_MS, 'Loading PDF.js');
      const data = await withTimeout(readPdfData(src, path), PDF_LOAD_TIMEOUT_MS, 'Reading PDF');
      if (cancelled || runId !== documentRun) return;

      loadingTask = pdfjs.getDocument({
        data,
        verbosity: pdfjs.VerbosityLevel.ERRORS,
      });
      pdf = await withTimeout(loadingTask.promise, PDF_LOAD_TIMEOUT_MS, 'Parsing PDF');
      if (cancelled || runId !== documentRun || !pdf) return;

      const firstPage = await pdf.getPage(1);
      if (cancelled || runId !== documentRun) return;

      const firstViewport = firstPage.getViewport({ scale: 1 });
      const pages = document.createElement('div');
      pages.className = 'preview-pdfjs-pages';
      pageShells.clear();
      visibleRatios.clear();

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const pageWrap = document.createElement('div');
        pageWrap.className = 'preview-pdfjs-page';
        pageWrap.dataset.pageNumber = String(pageNumber);
        pageWrap.setAttribute('aria-label', `${title} page ${pageNumber}`);

        const shell: PageShell = {
          pageNumber,
          element: pageWrap,
          width: firstViewport.width,
          height: firstViewport.height,
        };
        pageShells.set(pageNumber, shell);
        applyPageShellSize(shell, renderWidth);
        pageWrap.appendChild(createPagePlaceholder(pageNumber, pdf.numPages));
        pages.appendChild(pageWrap);
      }

      container.replaceChildren(pages);
      container.dataset.pdfjsState = 'ready';
      lastRenderedWidth = renderWidth;

      observer?.disconnect();
      observer = typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber || 0);
            if (!pageNumber) continue;
            if (entry.isIntersecting) {
              visibleRatios.set(pageNumber, entry.intersectionRatio);
            } else {
              visibleRatios.delete(pageNumber);
            }
          }
          renderMostVisiblePage();
        }, { threshold: [0, 0.15, 0.35, 0.55, 0.75], rootMargin: '160px 0px' })
        : null;

      if (observer) {
        pageShells.forEach((shell) => observer?.observe(shell.element));
      }

      void renderPage(1);
    } catch (error) {
      if (cancelled || runId !== documentRun) return;
      console.warn('Failed to render PDF preview:', error);
      container.dataset.pdfjsState = 'error';
      container.replaceChildren(
        createStatus('Failed to render PDF preview.', 'preview-pdfjs-status preview-pdfjs-error'),
        createFallbackLink(src, title),
      );
    }
  };

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      const nextWidth = getRenderWidth(container);
      if (Math.abs(nextWidth - lastRenderedWidth) < RESIZE_EPSILON_PX) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updatePageShellSizes();
        if (activePageNumber) {
          void renderPage(activePageNumber, true);
        }
      }, 150);
    })
    : null;

  void buildVirtualPages();
  resizeObserver?.observe(container);

  return () => {
    cancelled = true;
    documentRun += 1;
    pageRenderRun += 1;
    if (resizeTimer) clearTimeout(resizeTimer);
    observer?.disconnect();
    resizeObserver?.disconnect();
    activeRenderTask?.cancel();
    void loadingTask?.destroy();
    void pdf?.destroy();
  };
}
