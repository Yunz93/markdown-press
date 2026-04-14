import { renderMermaidDiagrams } from '../markdown-extensions';
import { PREVIEW_PANEL_WIDTH_PX } from './types';
import { saveExportFile } from './core';
import { prepareExportImages, waitForImages, waitForNextPaint } from './images';

export async function exportToPdf(htmlContent: string, filename: string, sourceFilePath?: string): Promise<string | null> {
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

    await prepareExportImages(renderTarget, sourceFilePath);
    await renderMermaidDiagrams(renderTarget);
    await waitForImages(renderTarget);
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    await waitForNextPaint(3);

    const pdfOptions: Html2PdfSetOptions & Html2PdfPagebreakOptions = {
      margin: [12, 12, 12, 12],
      filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      enableLinks: true,
      html2canvas: {
        scale: 2.5,
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
