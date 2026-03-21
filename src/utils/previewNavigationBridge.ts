let activePreviewElement: HTMLElement | null = null;
let pendingPreviewScrollRequest: { id: string; options?: PreviewScrollOptions } | null = null;

interface PreviewScrollOptions {
  alignTopRatio?: number;
  behavior?: ScrollBehavior;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findPreviewHeading(container: HTMLElement, id: string): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-heading-id], h1, h2, h3, h4, h5, h6'))
    .find((element) =>
      element.dataset.headingId === id
      || element.id === id
      || element.dataset.headingSlug === id
    ) ?? null;
}

function performScroll(container: HTMLElement, id: string, options?: PreviewScrollOptions): boolean {
  const target = findPreviewHeading(container, id);

  if (!target) return false;

  const alignTopRatio = clamp(options?.alignTopRatio ?? 0.18, 0, 1);
  const targetTop = container.scrollTop
    + target.getBoundingClientRect().top
    - container.getBoundingClientRect().top
    - container.clientHeight * alignTopRatio;

  container.scrollTo({
    top: Math.max(0, targetTop),
    behavior: options?.behavior ?? 'smooth',
  });

  return true;
}

export function registerActivePreviewElement(element: HTMLElement | null): void {
  activePreviewElement = element;
}

export function clearActivePreviewElement(element: HTMLElement): void {
  if (activePreviewElement === element) {
    activePreviewElement = null;
  }
}

export function scrollPreviewToHeading(id: string, options?: PreviewScrollOptions): boolean {
  if (!activePreviewElement) return false;

  const didScroll = performScroll(activePreviewElement, id, options);
  if (didScroll) {
    pendingPreviewScrollRequest = null;
  }
  return didScroll;
}

export function requestPreviewHeadingScroll(id: string, options?: PreviewScrollOptions): boolean {
  pendingPreviewScrollRequest = { id, options };
  return scrollPreviewToHeading(id, options);
}

export function flushPendingPreviewHeadingScroll(): boolean {
  if (!pendingPreviewScrollRequest) return false;

  const { id, options } = pendingPreviewScrollRequest;
  return scrollPreviewToHeading(id, options);
}
