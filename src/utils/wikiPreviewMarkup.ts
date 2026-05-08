import type { WikiLinkPreviewData } from '../components/editor/hooks/useWikiLinks';

/**
 * Build the DOM fragment used by EditorPane's WikiLink hover preview.
 *
 * Note: the markdown HTML inside should receive the same typography rules
 * as PreviewPane. Those rules are scoped under `.preview-pane-document.markdown-body`.
 */
export function buildWikiPreviewMarkup(preview: WikiLinkPreviewData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'wiki-link-hover-preview';

  const header = document.createElement('div');
  header.className = 'wiki-link-hover-preview-header';

  const title = document.createElement('div');
  title.className = 'wiki-link-hover-preview-title';
  title.textContent = preview.title;
  header.appendChild(title);

  if (preview.subtitle) {
    const subtitle = document.createElement('div');
    subtitle.className = 'wiki-link-hover-preview-subtitle';
    subtitle.textContent = preview.subtitle;
    header.appendChild(subtitle);
  }

  const body = document.createElement('article');
  // Include `preview-pane-document` so markdown typography comes from preview.css.
  body.className = 'markdown-body wiki-link-hover-preview-body preview-pane-document';
  body.innerHTML = preview.html;

  container.append(header, body);
  return container;
}

