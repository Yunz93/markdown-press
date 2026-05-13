import { renderMermaidDiagrams } from '../markdown-extensions';
import { PREVIEW_PANEL_WIDTH_PX } from './types';
import { enhanceExportAttachmentEmbeds, type ExportAttachmentContext } from './attachments';
import { prepareExportImages, waitForImages, waitForNextPaint } from './images';

/**
 * Largest single-canvas dimension html2canvas can safely allocate.
 *
 * Chromium's per-dimension canvas/GPU-texture cap is 16384px on most Windows
 * GPU drivers (and in WebView2). Going past it blanks the canvas or crashes
 * the renderer. We leave ~2.3k px headroom for resampling and rounding.
 */
export const EXPORT_MAX_CANVAS_DIMENSION = 14000;

/** Default rasterization scale; chosen for crisp PDF / long-image output on short documents. */
export const EXPORT_REQUESTED_RENDER_SCALE = 2.5;

/**
 * Absolute floor on the render scale. We allow sub-1.0 scales for very long
 * documents because a grainy raster is strictly better than a Windows WebView2
 * renderer crash from canvas-dimension overflow. Below ~0.1 the output is
 * not legible at all, so we cap there.
 */
export const EXPORT_MIN_RENDER_SCALE = 0.1;

/**
 * Clamp the html2canvas `scale` so neither dimension of the resulting canvas
 * exceeds the per-dimension canvas limit.
 *
 * Exported for testing.
 */
export function computeSafePdfRenderScale(
  containerWidthPx: number,
  containerHeightPx: number,
  requestedScale: number = EXPORT_REQUESTED_RENDER_SCALE,
  maxCanvasDimension: number = EXPORT_MAX_CANVAS_DIMENSION,
): number {
  const safeWidth = containerWidthPx > 0 ? maxCanvasDimension / containerWidthPx : requestedScale;
  const safeHeight = containerHeightPx > 0 ? maxCanvasDimension / containerHeightPx : requestedScale;
  const bounded = Math.min(requestedScale, safeWidth, safeHeight);
  return Math.max(EXPORT_MIN_RENDER_SCALE, bounded);
}

export interface MountedExportRasterHost {
  host: HTMLDivElement;
  renderTarget: HTMLElement;
  theme: 'light' | 'dark';
  backgroundColor: string;
}

export function mountExportHtmlForRasterization(htmlContent: string): MountedExportRasterHost {
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
  /** Hidden from view / hit-testing; direct `html2canvas(host subtree)` must temporarily undo these (see longImageExport). */
  host.style.visibility = 'hidden';
  host.style.opacity = '0';
  host.innerHTML = `<style>${styleContent}</style>${parsed.body.innerHTML}`;
  document.body.appendChild(host);

  const exportRoot = host.querySelector('.export-document') as HTMLElement | null;
  const renderTarget = exportRoot || host;
  renderTarget.setAttribute('data-theme', theme);

  return { host, renderTarget, theme, backgroundColor };
}

export async function prepareExportRenderTargetForRasterization(
  renderTarget: HTMLElement,
  theme: 'light' | 'dark',
  sourceFilePath?: string,
  attachmentContext?: ExportAttachmentContext | null,
): Promise<void> {
  await enhanceExportAttachmentEmbeds(renderTarget, sourceFilePath, attachmentContext);
  await prepareExportImages(renderTarget, sourceFilePath);
  await renderMermaidDiagrams(renderTarget, { themeMode: theme === 'dark' ? 'dark' : 'light' });
  await waitForImages(renderTarget);
  if ('fonts' in document) {
    await document.fonts.ready;
  }
  await waitForNextPaint(3);
}

export function disposeExportRasterHost(host: HTMLDivElement): void {
  if (host.parentNode) {
    host.parentNode.removeChild(host);
  }
}

export async function yieldToEventLoopForRasterCapture(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}
