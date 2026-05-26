/**
 * html2canvas 1.4.x 会把带 background 的 inline 元素按「整行宽」绘制，背景会盖住
 * 同行的文字和列表 marker，长图/PDF 导出里看起来像字体阴影错位。
 *  raster 前把行内 code 拆成更窄的 span，并标记列表行，配合 export CSS 使用。
 */

const RASTER_PATCHED_ATTR = 'data-mp-raster-patched';

/** 按空白切分；无空白的连续 CJK/符号串再按字符切，避免单个 span 仍占满行宽。 */
export function splitInlineCodeForRaster(text: string): string[] {
  const parts: string[] = [];
  const re = /\s+|\S+/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const token = match[0];
    if (/^\s+$/.test(token)) {
      parts.push(token);
      continue;
    }

    if (token.length > 1 && !/[A-Za-z0-9_]/.test(token)) {
      for (const ch of token) {
        parts.push(ch);
      }
      continue;
    }

    parts.push(token);
  }

  return parts;
}

function patchInlineCodeElements(root: HTMLElement): void {
  const codes = root.querySelectorAll<HTMLElement>('.markdown-body code');

  for (const code of codes) {
    if (code.closest('pre')) continue;
    if (code.getAttribute(RASTER_PATCHED_ATTR) === 'true') continue;

    const text = code.textContent ?? '';
    if (!text) continue;

    const parts = splitInlineCodeForRaster(text);
    code.textContent = '';
    code.setAttribute(RASTER_PATCHED_ATTR, 'true');
    code.classList.add('mp-export-raster-code');

    for (const part of parts) {
      const span = document.createElement('span');
      span.textContent = part;
      span.className = /^\s+$/.test(part)
        ? 'mp-export-raster-code-space'
        : 'mp-export-raster-code-chunk';
      code.appendChild(span);
    }
  }
}

function markRasterListItems(root: HTMLElement): void {
  const lists = root.querySelectorAll<HTMLElement>('.markdown-body ul, .markdown-body ol');
  for (const list of lists) {
    list.classList.add('mp-export-raster-list');
  }
}

/** 在 html2canvas 捕获前调用；仅影响离屏 raster DOM，不改动导出的 HTML 文件。 */
export function patchExportDomForHtml2Canvas(root: HTMLElement): void {
  patchInlineCodeElements(root);
  markRasterListItems(root);
}
