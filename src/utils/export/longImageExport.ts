import { saveExportFile } from "./core";
import type { ExportAttachmentContext } from "./types";
import {
  EXPORT_HTML2CANVAS_TIMEOUT_MS,
  buildHtml2CanvasRasterOptions,
  computeSafeLongImageRenderScale,
  disposeExportRasterHost,
  mountExportHtmlForRasterization,
  prepareExportRenderTargetForRasterization,
  restoreExportRasterHostStyles,
  revealExportRasterHostForCapture,
  withExportTimeout,
  yieldToEventLoopForRasterCapture,
} from "./exportRasterHost";
import { waitForNextPaint } from "./images";

export async function rasterizeExportHtmlToPngBlob(
  htmlContent: string,
  sourceFilePath?: string,
  attachmentContext?: ExportAttachmentContext | null,
): Promise<Blob> {
  const { host, renderTarget, theme, backgroundColor } =
    mountExportHtmlForRasterization(htmlContent);
  try {
    await prepareExportRenderTargetForRasterization(
      renderTarget,
      theme,
      sourceFilePath,
      attachmentContext,
    );

    const safeScale = computeSafeLongImageRenderScale(
      renderTarget.scrollWidth,
      renderTarget.scrollHeight,
    );

    await yieldToEventLoopForRasterCapture();

    const hostStyleSnapshot = revealExportRasterHostForCapture(host);
    await waitForNextPaint(2);

    const { default: html2canvas } = await import("html2canvas");
    let canvas: HTMLCanvasElement;
    try {
      canvas = await withExportTimeout(
        html2canvas(
          renderTarget,
          buildHtml2CanvasRasterOptions({
            scale: safeScale,
            backgroundColor,
            renderTarget,
          }) as Parameters<typeof html2canvas>[1],
        ),
        EXPORT_HTML2CANVAS_TIMEOUT_MS,
        "Long image export timed out while rasterizing HTML",
      );
    } finally {
      restoreExportRasterHostStyles(host, hostStyleSnapshot);
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error("Long image export failed: empty PNG blob"));
        }
      }, "image/png");
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
  const blob = await rasterizeExportHtmlToPngBlob(
    htmlContent,
    sourceFilePath,
    attachmentContext,
  );
  const arrayBuffer = await blob.arrayBuffer();
  return saveExportFile({
    content: new Uint8Array(arrayBuffer),
    filename,
    defaultExtension: ".png",
    mimeType: "image/png",
    description: "PNG Image",
  });
}
