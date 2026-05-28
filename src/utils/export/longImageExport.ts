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

export const EXPORT_CANVAS_TO_BLOB_TIMEOUT_MS = 30_000;
export const EXPORT_LONG_IMAGE_PREPARE_TIMEOUT_MS = 45_000;

export function canvasToPngBlob(
  canvas: HTMLCanvasElement,
  timeoutMs: number = EXPORT_CANVAS_TO_BLOB_TIMEOUT_MS,
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      callback();
    };

    timeoutId = setTimeout(() => {
      settle(() => {
        reject(new Error("Long image export timed out while encoding PNG"));
      });
    }, timeoutMs);

    canvas.toBlob((b) => {
      settle(() => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error("Long image export failed: empty PNG blob"));
        }
      });
    }, "image/png");
  });
}

export async function rasterizeExportHtmlToPngBlob(
  htmlContent: string,
  sourceFilePath?: string,
  attachmentContext?: ExportAttachmentContext | null,
): Promise<Blob> {
  const { host, renderTarget, theme, backgroundColor } =
    mountExportHtmlForRasterization(htmlContent);
  try {
    await withExportTimeout(
      prepareExportRenderTargetForRasterization(
        renderTarget,
        theme,
        sourceFilePath,
        attachmentContext,
      ),
      EXPORT_LONG_IMAGE_PREPARE_TIMEOUT_MS,
      "Long image export timed out while preparing HTML",
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

    const blob = await canvasToPngBlob(canvas);
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
