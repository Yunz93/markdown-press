/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushPendingPreviewHeadingScroll,
  registerPreviewPane,
  requestPreviewHeadingScroll,
  scrollPreviewToHeading,
  unregisterPreviewPane,
} from './previewNavigationBridge';

describe('previewNavigationBridge', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountPane(tabId = 'tab-a') {
    const container = document.createElement('div');
    container.style.height = '400px';
    container.style.overflow = 'auto';
    container.innerHTML = `
      <article class="markdown-body">
        <h2 id="section" data-heading-id="section" data-heading-text="Section">Section</h2>
      </article>
    `;
    document.body.appendChild(container);
    registerPreviewPane(tabId, container);
    return container;
  }

  it('scrolls to a registered heading by id', () => {
    const container = mountPane();
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    expect(scrollPreviewToHeading('tab-a', 'section')).toBe(true);
    expect(scrollTo).toHaveBeenCalled();
  });

  it('queues pending scroll requests and flushes after headings render', () => {
    const container = document.createElement('div');
    container.style.height = '400px';
    container.style.overflow = 'auto';
    container.innerHTML = '<article class="markdown-body"></article>';
    document.body.appendChild(container);
    registerPreviewPane('tab-b', container);

    expect(requestPreviewHeadingScroll('tab-b', 'late-heading')).toBe(false);

    container.innerHTML = '<article class="markdown-body"><h3 data-heading-id="late-heading">Late</h3></article>';
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    expect(flushPendingPreviewHeadingScroll('tab-b')).toBe(true);
    expect(scrollTo).toHaveBeenCalled();
  });

  it('clears registration when the same element unregisters', () => {
    const container = mountPane('tab-c');
    unregisterPreviewPane('tab-c', container);
    expect(scrollPreviewToHeading('tab-c', 'section')).toBe(false);
  });

  it('retries scroll on a timer when the heading is not yet present', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const container = mountPane('tab-d');
    container.innerHTML = '<article class="markdown-body"></article>';
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    expect(requestPreviewHeadingScroll('tab-d', 'retry-heading')).toBe(false);

    container.innerHTML = '<article class="markdown-body"><h2 data-heading-id="retry-heading">Retry</h2></article>';

    vi.advanceTimersByTime(16);
    expect(scrollTo).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
