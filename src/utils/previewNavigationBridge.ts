interface RegisteredPreviewPane {
  element: HTMLElement;
}

interface PendingPreviewScrollRequest {
  id: string;
  options?: PreviewScrollOptions;
}

const previewPanes = new Map<string, RegisteredPreviewPane>();
const pendingPreviewScrollRequests = new Map<string, PendingPreviewScrollRequest>();

export interface PreviewScrollOptions {
  alignTopRatio?: number;
  behavior?: ScrollBehavior;
}

function getPreviewPaneKey(tabId: string | null | undefined): string {
  return tabId ?? '__no-active-tab__';
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

export function registerPreviewPane(tabId: string | null | undefined, element: HTMLElement): void {
  previewPanes.set(getPreviewPaneKey(tabId), { element });
}

export function unregisterPreviewPane(tabId: string | null | undefined, element: HTMLElement): void {
  const key = getPreviewPaneKey(tabId);
  const registeredPane = previewPanes.get(key);
  if (registeredPane?.element === element) {
    previewPanes.delete(key);
  }
}

export function scrollPreviewToHeading(
  tabId: string | null | undefined,
  id: string,
  options?: PreviewScrollOptions
): boolean {
  const key = getPreviewPaneKey(tabId);
  const registeredPane = previewPanes.get(key);
  if (!registeredPane) return false;

  const didScroll = performScroll(registeredPane.element, id, options);
  if (didScroll) {
    pendingPreviewScrollRequests.delete(key);
  }
  return didScroll;
}

export function requestPreviewHeadingScroll(
  tabId: string | null | undefined,
  id: string,
  options?: PreviewScrollOptions
): boolean {
  const key = getPreviewPaneKey(tabId);
  pendingPreviewScrollRequests.set(key, { id, options });
  return scrollPreviewToHeading(tabId, id, options);
}

export function flushPendingPreviewHeadingScroll(tabId: string | null | undefined): boolean {
  const key = getPreviewPaneKey(tabId);
  const pendingRequest = pendingPreviewScrollRequests.get(key);
  if (!pendingRequest) return false;

  return scrollPreviewToHeading(tabId, pendingRequest.id, pendingRequest.options);
}
