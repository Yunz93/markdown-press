interface RegisteredPreviewPane {
  element: HTMLElement;
}

interface PendingPreviewScrollRequest {
  id: string;
  options?: PreviewScrollOptions;
}

const previewPanes = new Map<string, RegisteredPreviewPane>();
const pendingPreviewScrollRequests = new Map<string, PendingPreviewScrollRequest>();
const previewScrollRetryTimers = new Map<string, number[]>();
const PREVIEW_SCROLL_RETRY_DELAYS_MS = [16, 64, 180];

export interface PreviewScrollOptions {
  alignTopRatio?: number;
  alignMode?: 'top' | 'center';
  behavior?: ScrollBehavior;
}

function getPreviewPaneKey(tabId: string | null | undefined): string {
  return tabId ?? '__no-active-tab__';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findPreviewHeading(container: HTMLElement, id: string): HTMLElement | null {
  const normalizedId = id.trim().replace(/^#+/, '').trim();
  return Array.from(container.querySelectorAll<HTMLElement>('[data-heading-id], h1, h2, h3, h4, h5, h6'))
    .find((element) =>
      element.dataset.headingId === normalizedId
      || element.id === normalizedId
      || element.dataset.headingSlug === normalizedId
      || element.dataset.headingText === normalizedId
      || element.textContent?.trim() === normalizedId
    ) ?? null;
}

function clearPendingScrollRetries(key: string): void {
  const timers = previewScrollRetryTimers.get(key);
  if (!timers) return;

  timers.forEach((timerId) => window.clearTimeout(timerId));
  previewScrollRetryTimers.delete(key);
}

function performScroll(container: HTMLElement, id: string, options?: PreviewScrollOptions): boolean {
  const target = findPreviewHeading(container, id);
  if (!target) return false;

  const targetRect = target.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const relativeTargetTop = container.scrollTop + targetRect.top - containerRect.top;
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const targetTop = options?.alignMode === 'center'
    ? relativeTargetTop + targetRect.height / 2 - container.clientHeight / 2
    : relativeTargetTop - container.clientHeight * clamp(options?.alignTopRatio ?? 0.18, 0, 1);

  container.scrollTo({
    top: clamp(targetTop, 0, maxScrollTop),
    behavior: options?.behavior ?? 'smooth',
  });

  return true;
}

export function registerPreviewPane(tabId: string | null | undefined, element: HTMLElement): void {
  previewPanes.set(getPreviewPaneKey(tabId), { element });
}

export function unregisterPreviewPane(tabId: string | null | undefined, element: HTMLElement): void {
  const key = getPreviewPaneKey(tabId);
  clearPendingScrollRetries(key);
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
    clearPendingScrollRetries(key);
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
  clearPendingScrollRetries(key);
  pendingPreviewScrollRequests.set(key, { id, options });
  const didScroll = scrollPreviewToHeading(tabId, id, options);
  if (didScroll) {
    return true;
  }

  previewScrollRetryTimers.set(key, PREVIEW_SCROLL_RETRY_DELAYS_MS.map((delay) => window.setTimeout(() => {
    scrollPreviewToHeading(tabId, id, options);
  }, delay)));
  return false;
}

export function flushPendingPreviewHeadingScroll(tabId: string | null | undefined): boolean {
  const key = getPreviewPaneKey(tabId);
  const pendingRequest = pendingPreviewScrollRequests.get(key);
  if (!pendingRequest) return false;

  return scrollPreviewToHeading(tabId, pendingRequest.id, pendingRequest.options);
}
