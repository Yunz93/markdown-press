/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeadingNode } from './outline';
import { applyPreviewHeadingAttributes } from './previewHeadingAttributes';
import {
  registerPreviewPane,
  requestPreviewHeadingScroll,
  unregisterPreviewPane,
} from './previewNavigationBridge';

describe('applyPreviewHeadingAttributes', () => {
  const tabId = 'target-note';
  let rafId = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      rafId += 1;
      return rafId;
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('flushes a pending cross-file heading scroll after headings render late', () => {
    const container = document.createElement('div');
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;
    container.innerHTML = '<article class="markdown-body"></article>';
    document.body.appendChild(container);
    registerPreviewPane(tabId, container);

    expect(requestPreviewHeadingScroll(tabId, '4.3 区块引用')).toBe(false);

    container.innerHTML = '<article class="markdown-body"><h4>4.3 区块引用</h4></article>';
    const headings: HeadingNode[] = [{
      id: '43-区块引用',
      level: 4,
      text: '4.3 区块引用',
      children: [],
      line: 12,
    }];

    applyPreviewHeadingAttributes(container, headings, tabId);

    expect(container.querySelector('h4')?.dataset.headingText).toBe('4.3 区块引用');
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });

    unregisterPreviewPane(tabId, container);
    container.remove();
  });
});
