interface RegisteredPreviewPane {
  element: HTMLElement;
}

interface PendingPreviewScrollRequest {
  id: string;
  options?: PreviewScrollOptions;
}

const previewPanes = new Map<string, RegisteredPreviewPane>();
const pendingPreviewScrollRequests = new Map<
  string,
  PendingPreviewScrollRequest
>();
const previewScrollRetryTimers = new Map<string, number[]>();
/** Monotonic token so a late correction never re-jumps to a superseded heading. */
const previewScrollRequestTokens = new Map<string, number>();
/** Longer window so late heading attrs / Mermaid layout can still settle. */
const PREVIEW_SCROLL_RETRY_DELAYS_MS = [16, 64, 180, 360, 800];
/** Keep split-pane percentage sync and scroll-spy quiet while outline jumps. */
const HEADING_NAVIGATION_LOCK_MS = 700;
let headingNavigationLockUntil = 0;
let headingNavigationLockTimer: number | null = null;

export interface PreviewScrollOptions {
  alignTopRatio?: number;
  alignMode?: "top" | "center";
  behavior?: ScrollBehavior;
}

function getPreviewPaneKey(tabId: string | null | undefined): string {
  return tabId ?? "__no-active-tab__";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findPreviewHeading(
  container: HTMLElement,
  id: string,
): HTMLElement | null {
  const normalizedId = id.trim().replace(/^#+/, "").trim();
  if (!normalizedId) return null;
  return (
    Array.from(
      container.querySelectorAll<HTMLElement>(
        "[data-heading-id], h1, h2, h3, h4, h5, h6",
      ),
    ).find(
      (element) =>
        element.dataset.headingId === normalizedId ||
        element.id === normalizedId ||
        element.dataset.headingSlug === normalizedId ||
        element.dataset.headingText === normalizedId ||
        element.textContent?.trim() === normalizedId,
    ) ?? null
  );
}

function clearPendingScrollRetries(key: string): void {
  const timers = previewScrollRetryTimers.get(key);
  if (!timers) return;

  timers.forEach((timerId) => window.clearTimeout(timerId));
  previewScrollRetryTimers.delete(key);
}

function computeTargetScrollTop(
  container: HTMLElement,
  target: HTMLElement,
  options?: PreviewScrollOptions,
): number {
  const targetRect = target.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const relativeTargetTop =
    container.scrollTop + targetRect.top - containerRect.top;
  const maxScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );
  const targetTop =
    options?.alignMode === "center"
      ? relativeTargetTop + targetRect.height / 2 - container.clientHeight / 2
      : relativeTargetTop -
        container.clientHeight * clamp(options?.alignTopRatio ?? 0.18, 0, 1);
  return clamp(targetTop, 0, maxScrollTop);
}

function performScroll(
  container: HTMLElement,
  id: string,
  options?: PreviewScrollOptions,
): boolean {
  const target = findPreviewHeading(container, id);
  if (!target) return false;

  // Force layout recalculation for accurate measurements
  void container.offsetHeight;
  void target.offsetHeight;

  const behavior = options?.behavior ?? "auto";
  // Remeasure inside the frame that actually scrolls — heights often change
  // between the initial lookup and the next paint (images, KaTeX, Mermaid).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const liveTarget = findPreviewHeading(container, id);
      if (!liveTarget) return;
      void container.offsetHeight;
      void liveTarget.offsetHeight;
      container.scrollTo({
        top: computeTargetScrollTop(container, liveTarget, options),
        behavior,
      });
    });
  });

  return true;
}

export function beginHeadingNavigationLock(
  durationMs: number = HEADING_NAVIGATION_LOCK_MS,
): void {
  const until = Date.now() + Math.max(0, durationMs);
  headingNavigationLockUntil = Math.max(headingNavigationLockUntil, until);
  if (headingNavigationLockTimer !== null) {
    window.clearTimeout(headingNavigationLockTimer);
  }
  headingNavigationLockTimer = window.setTimeout(
    () => {
      headingNavigationLockTimer = null;
      if (Date.now() >= headingNavigationLockUntil) {
        headingNavigationLockUntil = 0;
      }
    },
    Math.max(0, headingNavigationLockUntil - Date.now()),
  );
}

export function endHeadingNavigationLock(): void {
  headingNavigationLockUntil = 0;
  if (headingNavigationLockTimer !== null) {
    window.clearTimeout(headingNavigationLockTimer);
    headingNavigationLockTimer = null;
  }
}

export function isHeadingNavigationLocked(): boolean {
  return Date.now() < headingNavigationLockUntil;
}

export function registerPreviewPane(
  tabId: string | null | undefined,
  element: HTMLElement,
): void {
  previewPanes.set(getPreviewPaneKey(tabId), { element });
}

export function unregisterPreviewPane(
  tabId: string | null | undefined,
  element: HTMLElement,
): void {
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
  options?: PreviewScrollOptions,
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
  options?: PreviewScrollOptions,
): boolean {
  const key = getPreviewPaneKey(tabId);
  clearPendingScrollRetries(key);
  beginHeadingNavigationLock();
  // Prefer instant jumps for reliability (smooth fights split sync / scroll-spy).
  const resolvedOptions: PreviewScrollOptions = {
    ...options,
    behavior: options?.behavior ?? "auto",
  };
  const requestToken = (previewScrollRequestTokens.get(key) ?? 0) + 1;
  previewScrollRequestTokens.set(key, requestToken);
  pendingPreviewScrollRequests.set(key, { id, options: resolvedOptions });
  const didScroll = scrollPreviewToHeading(tabId, id, resolvedOptions);
  if (didScroll) {
    // One late correction after layout-heavy content (images / Mermaid) settles.
    previewScrollRetryTimers.set(key, [
      window.setTimeout(() => {
        if (previewScrollRequestTokens.get(key) !== requestToken) return;
        beginHeadingNavigationLock(400);
        scrollPreviewToHeading(tabId, id, {
          ...resolvedOptions,
          behavior: "auto",
        });
      }, 200),
    ]);
    return true;
  }

  previewScrollRetryTimers.set(
    key,
    PREVIEW_SCROLL_RETRY_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        if (previewScrollRequestTokens.get(key) !== requestToken) return;
        scrollPreviewToHeading(tabId, id, resolvedOptions);
      }, delay),
    ),
  );
  return false;
}

export function flushPendingPreviewHeadingScroll(
  tabId: string | null | undefined,
): boolean {
  const key = getPreviewPaneKey(tabId);
  const pendingRequest = pendingPreviewScrollRequests.get(key);
  if (!pendingRequest) return false;

  return scrollPreviewToHeading(
    tabId,
    pendingRequest.id,
    pendingRequest.options,
  );
}

/** Test helper: reset module state between cases. */
export function __resetPreviewNavigationBridgeForTests(): void {
  previewPanes.clear();
  pendingPreviewScrollRequests.clear();
  for (const timers of previewScrollRetryTimers.values()) {
    timers.forEach((timerId) => window.clearTimeout(timerId));
  }
  previewScrollRetryTimers.clear();
  previewScrollRequestTokens.clear();
  endHeadingNavigationLock();
}
