/**
 * WKWebView (Tauri release) may strip inline token styles when serializing a subtree with
 * `innerHTML`. Shiki highlights rely on those spans, so we substitute `<pre class="shiki">…</pre>`
 * fragments from the original HTML strings before DOM mutation and splice them back after.
 */

// If we wrap Shiki blocks (for consistent rounded corners), snapshot the wrapper+pre together;
// otherwise, snapshot the raw `<pre class="shiki">` fragment.
const SHIKI_BLOCK_HTML_REGEX =
  /<div\b[^>]*\bclass="[^"]*\bmp-shiki-block\b[^"]*"[^>]*>\s*<pre\b[^>]*\bclass="[^"]*\bshiki\b[^"]*"[^>]*>[\s\S]*?<\/pre>\s*<\/div>|<pre\b[^>]*\bclass="[^"]*\bshiki\b[^"]*"[^>]*>[\s\S]*?<\/pre>/gi;

function hashSnapshot(input: string): string {
  // Small deterministic hash to reduce placeholder collision risk.
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  // Convert to unsigned hex and keep it short.
  return (h >>> 0).toString(16).slice(0, 8).padStart(8, "0");
}

/** Replace each Shiki `<pre>` in `html` with a numbered placeholder; append originals to `snapshots`. */
export function protectShikiPresInHtmlString(
  html: string,
  snapshots: string[],
): string {
  return html.replace(SHIKI_BLOCK_HTML_REGEX, (full) => {
    const id = snapshots.push(full) - 1;
    const h = hashSnapshot(full);
    return `<div data-mp-shiki-slot="${id}" data-mp-shiki-h="${h}"></div>`;
  });
}

/** Inverse of {@link protectShikiPresInHtmlString} after DOM work and `innerHTML` readback.
 *
 *  Matches placeholders by both {@code data-mp-shiki-slot} and {@code data-mp-shiki-h}
 *  so protection-created markers are distinguished from user-authored HTML, while
 *  tolerating attribute reordering / whitespace changes from WKWebView serialization. */
export function restoreShikiPresFromSnapshots(
  html: string,
  snapshots: string[],
): string {
  if (snapshots.length === 0) return html;
  let out = html;
  for (let i = snapshots.length - 1; i >= 0; i -= 1) {
    const slotRegex = new RegExp(
      `<div\\b[^>]*?\\bdata-mp-shiki-slot="${i}"[^>]*?\\bdata-mp-shiki-h="[^"]*"[^>]*?></div>`,
      "g",
    );
    out = out.replace(slotRegex, snapshots[i]);
  }
  return out;
}
