import { renderMermaidDiagrams } from '../markdown-extensions';
import { PREVIEW_PANEL_WIDTH_PX } from './types';
import { saveExportFile } from './core';
import { enhanceExportAttachmentEmbeds, type ExportAttachmentContext } from './attachments';
import { prepareExportImages, waitForImages, waitForNextPaint } from './images';

/**
 * Largest single-canvas dimension html2canvas can safely allocate.
 *
 * Chromium's per-dimension canvas/GPU-texture cap is 16384px on most Windows
 * GPU drivers (and in WebView2). Going past it blanks the canvas or crashes
 * the renderer. We leave ~2.3k px headroom for resampling and rounding.
 */
const MAX_CANVAS_DIMENSION = 14000;

/** Default rasterization scale; chosen for crisp PDF output on short documents. */
const REQUESTED_RENDER_SCALE = 2.5;

/**
 * Absolute floor on the render scale. We allow sub-1.0 scales for very long
 * documents because a grainy PDF is strictly better than a Windows WebView2
 * renderer crash from canvas-dimension overflow. Below ~0.1 the output is
 * not legible at all, so we cap there.
 */
const MIN_RENDER_SCALE = 0.1;

/**
 * Clamp the html2canvas `scale` so neither dimension of the resulting canvas
 * exceeds the per-dimension canvas limit. Long documents otherwise allocate a
 * single canvas of `width*scale × height*scale` px which freezes the main
 * thread on macOS and crashes the WebView renderer on Windows.
 *
 * Exported for testing.
 */
export function computeSafePdfRenderScale(
  containerWidthPx: number,
  containerHeightPx: number,
  requestedScale: number = REQUESTED_RENDER_SCALE,
  maxCanvasDimension: number = MAX_CANVAS_DIMENSION,
): number {
  const safeWidth = containerWidthPx > 0 ? maxCanvasDimension / containerWidthPx : requestedScale;
  const safeHeight = containerHeightPx > 0 ? maxCanvasDimension / containerHeightPx : requestedScale;
  const bounded = Math.min(requestedScale, safeWidth, safeHeight);
  return Math.max(MIN_RENDER_SCALE, bounded);
}

/** Yield to the event loop so the spinner can paint before the synchronous html2canvas freeze. */
async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function exportToPdf(
  htmlContent: string,
  filename: string,
  sourceFilePath?: string,
  attachmentContext?: ExportAttachmentContext | null,
): Promise<string | null> {
  const { default: html2pdf } = await import('html2pdf.js');
  type Html2PdfWorker = InstanceType<typeof html2pdf.Worker>;
  type Html2PdfSetOptions = Parameters<Html2PdfWorker['set']>[0];
  type Html2PdfPagebreakOptions = {
    pagebreak?: {
      mode?: Array<'avoid-all' | 'css' | 'legacy'>;
      avoid?: string[];
    };
  };
  const parsed = new DOMParser().parseFromString(htmlContent, 'text/html');
  const styleContent = Array.from(parsed.head.querySelectorAll('style'))
    .map((style) => style.textContent || '')
    .join('\n');
  const theme = parsed.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const backgroundColor = theme === 'dark' ? '#0d1117' : '#ffffff';

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${PREVIEW_PANEL_WIDTH_PX + 64}px`;
  host.style.background = backgroundColor;
  host.style.pointerEvents = 'none';
  host.style.visibility = 'hidden';
  host.style.opacity = '0';
  host.style.contain = 'layout style';
  host.innerHTML = `<style>${styleContent}</style>${parsed.body.innerHTML}`;
  document.body.appendChild(host);

  const exportRoot = host.querySelector('.export-document') as HTMLElement | null;
  const renderTarget = exportRoot || host;

  try {
    renderTarget.setAttribute('data-theme', theme);

    await enhanceExportAttachmentEmbeds(renderTarget, sourceFilePath, attachmentContext);
    await prepareExportImages(renderTarget, sourceFilePath);
    await renderMermaidDiagrams(renderTarget, { themeMode: theme === 'dark' ? 'dark' : 'light' });
    await waitForImages(renderTarget);
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    await waitForNextPaint(3);

    const safeScale = computeSafePdfRenderScale(
      renderTarget.scrollWidth,
      renderTarget.scrollHeight,
    );

    const pdfOptions: Html2PdfSetOptions & Html2PdfPagebreakOptions = {
      margin: [12, 12, 12, 12],
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      // quality 1 is uncompressed and produces giant base64 strings per page;
      // 0.92 is visually identical for text/diagrams and several times smaller.
      image: { type: 'jpeg', quality: 0.92 },
      enableLinks: true,
      html2canvas: {
        scale: safeScale,
        useCORS: true,
        backgroundColor,
        windowWidth: renderTarget.scrollWidth,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['pre', 'blockquote', 'table', 'img', '.export-properties']
      }
    };

    // Let the export spinner paint before html2canvas grabs the main thread.
    await yieldToEventLoop();

    const worker = html2pdf()
      .set(pdfOptions as Html2PdfSetOptions)
      .from(renderTarget)
      .toPdf();

    const pdfArrayBuffer = await worker.outputPdf('arraybuffer');
    return saveExportFile({
      content: new Uint8Array(pdfArrayBuffer),
      filename,
      defaultExtension: '.pdf',
      mimeType: 'application/pdf',
      description: 'PDF Document',
    });
  } finally {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
  }
}
