/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPreviewNavigationBridgeForTests,
  beginHeadingNavigationLock,
  endHeadingNavigationLock,
  flushPendingPreviewHeadingScroll,
  isHeadingNavigationLocked,
  registerPreviewPane,
  requestPreviewHeadingScroll,
  scrollPreviewToHeading,
  unregisterPreviewPane,
} from "./previewNavigationBridge";

describe("previewNavigationBridge", () => {
  beforeEach(() => {
    __resetPreviewNavigationBridgeForTests();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    __resetPreviewNavigationBridgeForTests();
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountPane(tabId = "tab-a") {
    const container = document.createElement("div");
    container.style.height = "400px";
    container.style.overflow = "auto";
    container.innerHTML = `
      <article class="markdown-body">
        <h2 id="section" data-heading-id="section" data-heading-text="Section">Section</h2>
      </article>
    `;
    document.body.appendChild(container);
    registerPreviewPane(tabId, container);
    return container;
  }

  it("scrolls to a registered heading by id", () => {
    const container = mountPane();
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    expect(scrollPreviewToHeading("tab-a", "section")).toBe(true);
    expect(scrollTo).toHaveBeenCalled();
  });

  it("queues pending scroll requests and flushes after headings render", () => {
    const container = document.createElement("div");
    container.style.height = "400px";
    container.style.overflow = "auto";
    container.innerHTML = '<article class="markdown-body"></article>';
    document.body.appendChild(container);
    registerPreviewPane("tab-b", container);

    expect(requestPreviewHeadingScroll("tab-b", "late-heading")).toBe(false);

    container.innerHTML =
      '<article class="markdown-body"><h3 data-heading-id="late-heading">Late</h3></article>';
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    expect(flushPendingPreviewHeadingScroll("tab-b")).toBe(true);
    expect(scrollTo).toHaveBeenCalled();
  });

  it("clears registration when the same element unregisters", () => {
    const container = mountPane("tab-c");
    unregisterPreviewPane("tab-c", container);
    expect(scrollPreviewToHeading("tab-c", "section")).toBe(false);
  });

  it("retries scroll on a timer when the heading is not yet present", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const container = mountPane("tab-d");
    container.innerHTML = '<article class="markdown-body"></article>';
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    expect(requestPreviewHeadingScroll("tab-d", "retry-heading")).toBe(false);

    container.innerHTML =
      '<article class="markdown-body"><h2 data-heading-id="retry-heading">Retry</h2></article>';

    vi.advanceTimersByTime(16);
    expect(scrollTo).toHaveBeenCalled();
  });

  it("locks heading navigation while a jump is in flight", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    beginHeadingNavigationLock(500);
    expect(isHeadingNavigationLocked()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(isHeadingNavigationLocked()).toBe(false);
    endHeadingNavigationLock();
  });

  it("defaults outline jumps to instant scroll behavior", () => {
    const container = mountPane("tab-e");
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    expect(requestPreviewHeadingScroll("tab-e", "section")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );
  });
});
