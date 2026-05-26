/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EditorView } from '@codemirror/view';
import { useScrollSync } from './useScrollSync';

function createMockView(scrollTop = 0): EditorView {
  const scrollDOM = document.createElement('div');
  Object.defineProperty(scrollDOM, 'scrollHeight', { configurable: true, value: 2000 });
  Object.defineProperty(scrollDOM, 'clientHeight', { configurable: true, value: 500 });
  scrollDOM.scrollTop = scrollTop;
  return { scrollDOM } as unknown as EditorView;
}

describe('useScrollSync', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits scroll percentage from the registered editor view', () => {
    const onScroll = vi.fn();
    const { result } = renderHook(() => useScrollSync({ onScroll }));
    const view = createMockView(500);
    result.current.registerView(view);

    act(() => {
      result.current.handleScroll();
    });

    expect(onScroll).toHaveBeenCalledWith(500 / 1500);
  });

  it('syncs the editor scroll position to a percentage immediately', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const { result } = renderHook(() => useScrollSync({}));
    const view = createMockView(0);
    result.current.registerView(view);

    act(() => {
      result.current.syncScrollTo(0.25, { immediate: true });
    });

    expect(view.scrollDOM.scrollTop).toBe(375);
  });

  it('ignores sync requests when no editor view is registered', () => {
    const { result } = renderHook(() => useScrollSync({}));

    act(() => {
      result.current.syncScrollTo(0.5);
    });

    expect(result.current.handleScroll()).toBeUndefined();
  });
});
