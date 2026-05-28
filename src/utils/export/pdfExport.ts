import { saveExportFile } from "./core";
import type { ExportAttachmentContext } from "./attachments";
import {
  buildHtml2CanvasRasterOptions,
  computeSafePdfRenderScale,
  disposeExportRasterHost,
  mountExportHtmlForRasterization,
  prepareExportRenderTargetForRasterization,
  restoreExportRasterHostStyles,
  revealExportRasterHostForCapture,
  yieldToEventLoopForRasterCapture,
} from "./exportRasterHost";
import { waitForNextPaint } from "./images";

/** Re-exported for backward compatibility with tests and external imports. */
export { computeSafePdfRenderScale } from "./exportRasterHost";

export async function exportToPdf(
  htmlContent: string,
  filename: string,
  sourceFilePath?: string,
  attachmentContext?: ExportAttachmentContext | null,
): Promise<string | null> {
  const { default: html2pdf } = await import("html2pdf.js");
  type Html2PdfWorker = InstanceType<typeof html2pdf.Worker>;
  type Html2PdfSetOptions = Parameters<Html2PdfWorker["set"]>[0];
  type Html2PdfPagebreakOptions = {
    pagebreak?: {
      mode?: Array<"avoid-all" | "css" | "legacy">;
    };
  };

  const { host, renderTarget, theme, backgroundColor } =
    mountExportHtmlForRasterization(htmlContent);

  try {
    await prepareExportRenderTargetForRasterization(
      renderTarget,
      theme,
      sourceFilePath,
      attachmentContext,
    );

    const safeScale = computeSafePdfRenderScale(
      renderTarget.scrollWidth,
      renderTarget.scrollHeight,
    );

    const pdfOptions: Html2PdfSetOptions & Html2PdfPagebreakOptions = {
      margin: [12, 12, 12, 12],
      filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
      image: { type: "jpeg", quality: 0.92 },
      enableLinks: true,
      html2canvas: buildHtml2CanvasRasterOptions({
        scale: safeScale,
        backgroundColor,
        renderTarget,
      }),
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      },
      pagebreak: {
        mode: ["css", "legacy"],
      },
    };

    await yieldToEventLoopForRasterCapture();

    const hostStyleSnapshot = revealExportRasterHostForCapture(host);
    await waitForNextPaint(2);

    const worker = html2pdf()
      .set(pdfOptions as Html2PdfSetOptions)
      .from(renderTarget)
      .toPdf();

    let pdfArrayBuffer: ArrayBuffer;
    try {
      pdfArrayBuffer = await worker.outputPdf("arraybuffer");
    } finally {
      restoreExportRasterHostStyles(host, hostStyleSnapshot);
    }

    return saveExportFile({
      content: new Uint8Array(pdfArrayBuffer),
      filename,
      defaultExtension: ".pdf",
      mimeType: "application/pdf",
      description: "PDF Document",
    });
  } finally {
    disposeExportRasterHost(host);
  }
}
