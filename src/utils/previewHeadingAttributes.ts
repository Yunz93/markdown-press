import { createHeadingSlug, type HeadingNode } from './outline';
import { flushPendingPreviewHeadingScroll } from './previewNavigationBridge';

export function applyPreviewHeadingAttributes(
  container: HTMLElement,
  headings: HeadingNode[],
  activeTabId?: string | null
): void {
  const headingElements = Array.from(container.querySelectorAll<HTMLElement>(
    'article.markdown-body h1, article.markdown-body h2, article.markdown-body h3, article.markdown-body h4, article.markdown-body h5, article.markdown-body h6'
  ));

  headingElements.forEach((element: HTMLElement, index) => {
    const heading = headings[index];
    if (!heading) {
      element.removeAttribute('data-heading-id');
      element.removeAttribute('data-heading-slug');
      element.removeAttribute('data-heading-text');
      return;
    }

    element.id = heading.id;
    element.dataset.headingId = heading.id;
    element.dataset.headingSlug = createHeadingSlug(heading.text);
    element.dataset.headingText = heading.text;
  });

  if (activeTabId) {
    flushPendingPreviewHeadingScroll(activeTabId);
  }
}
