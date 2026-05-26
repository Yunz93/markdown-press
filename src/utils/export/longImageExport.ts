import { saveExportFile } from './core';
import type { ExportAttachmentContext } from './attachments';
import {
  computeSafePdfRenderScale,
  disposeExportRasterHost,
  mountExportHtmlForRasterization,
  prepareExportRenderTargetForRasterization,
  yieldToEventLoopForRasterCapture,
} from './exportRasterHost';
import { waitForNextPaint } from './images';

export async function rasterizeExportHtmlToPngBlob(
  htmlContent: string,
  sourceFilePath?: string,
  attachmentContext?: ExportAttachmentContext | null,
): Promise<Blob> {
  const { host, renderTarget, theme, backgroundColor } = mountExportHtmlForRasterization(htmlContent);
  try {
    await prepareExportRenderTargetForRasterization(renderTarget, theme, sourceFilePath, attachmentContext);

    const safeScale = computeSafePdfRenderScale(
      renderTarget.scrollWidth,
      renderTarget.scrollHeight,
    );

    await yieldToEventLoopForRasterCapture();

    // html2canvas treats nodes under opacity:0 / visibility:hidden as unpaintable
    // (see element-stack visibility gate in html2canvas). The off-screen host uses
    // those styles so the user never sees a layout flash; restore them after capture.
    const prevVisibility = host.style.visibility;
    const prevOpacity = host.style.opacity;
    host.style.visibility = 'visible';
    host.style.opacity = '1';
    await waitForNextPaint(2);

    const { default: html2canvas } = await import('html2canvas');
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(renderTarget, {
        scale: safeScale,
        useCORS: true,
        backgroundColor,
        windowWidth: renderTarget.scrollWidth,
        scrollX: 0,
        scrollY: 0,
        logging: false,
      });
    } finally {
      host.style.visibility = prevVisibility;
      host.style.opacity = prevOpacity;
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) {
            resolve(b);
          } else {
            reject(new Error('Long image export failed: empty PNG blob'));
          }
        },
        'image/png',
      );
    });
    return blob;
  } finally {
    disposeExportRasterHost(host);
  }
}

export async function exportLongImagePng(
  htmlContent: string,
  filename: string,
  sourceFilePath?: string,
  attachmentContext?: ExportAttachmentContext | null,
): Promise<string | null> {
  const blob = await rasterizeExportHtmlToPngBlob(htmlContent, sourceFilePath, attachmentContext);
  const arrayBuffer = await blob.arrayBuffer();
  return saveExportFile({
    content: new Uint8Array(arrayBuffer),
    filename,
    defaultExtension: '.png',
    mimeType: 'image/png',
    description: 'PNG Image',
  });
}
