import { saveExportFile } from './core';
import type { ExportAttachmentContext } from './attachments';
import {
  computeSafePdfRenderScale,
  disposeExportRasterHost,
  mountExportHtmlForRasterization,
  prepareExportRenderTargetForRasterization,
  yieldToEventLoopForRasterCapture,
} from './exportRasterHost';

/** Re-exported for backward compatibility with tests and external imports. */
export { computeSafePdfRenderScale } from './exportRasterHost';

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
    };
  };

  const { host, renderTarget, theme, backgroundColor } = mountExportHtmlForRasterization(htmlContent);

  try {
    await prepareExportRenderTargetForRasterization(renderTarget, theme, sourceFilePath, attachmentContext);

    const safeScale = computeSafePdfRenderScale(
      renderTarget.scrollWidth,
      renderTarget.scrollHeight,
    );

    const pdfOptions: Html2PdfSetOptions & Html2PdfPagebreakOptions = {
      margin: [12, 12, 12, 12],
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.92 },
      enableLinks: true,
      html2canvas: {
        scale: safeScale,
        useCORS: true,
        backgroundColor,
        windowWidth: renderTarget.scrollWidth,
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
      pagebreak: {
        mode: ['css', 'legacy'],
      },
    };

    await yieldToEventLoopForRasterCapture();

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
    disposeExportRasterHost(host);
  }
}
