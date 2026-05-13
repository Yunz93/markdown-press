/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { computeMenuViewportFit, applyFixedMenuViewportFit, MENU_VIEWPORT_PADDING } from './fitFixedMenuToViewport';

describe('computeMenuViewportFit', () => {
  const viewport = { width: 800, height: 800 };

  it('shifts top upward when the menu would extend past the bottom edge', () => {
    const pad = MENU_VIEWPORT_PADDING;
    const result = computeMenuViewportFit(
      { left: 10, top: 700 },
      { width: 200, height: 250 },
      viewport
    );
    expect(result.top).toBe(viewport.height - pad - 250);
    expect(result.maxHeight).toBeUndefined();
  });

  it('caps height and pins to top when the menu is taller than the viewport', () => {
    const pad = MENU_VIEWPORT_PADDING;
    const maxInner = viewport.height - pad * 2;
    const result = computeMenuViewportFit(
      { left: 10, top: 100 },
      { width: 200, height: 900 },
      viewport
    );
    expect(result.top).toBe(pad);
    expect(result.maxHeight).toBe(maxInner);
  });

  it('shifts left when the menu would extend past the right edge', () => {
    const pad = MENU_VIEWPORT_PADDING;
    const result = computeMenuViewportFit(
      { left: 700, top: 100 },
      { width: 220, height: 100 },
      viewport
    );
    expect(result.left).toBe(viewport.width - 220 - pad);
  });
});

describe('applyFixedMenuViewportFit', () => {
  function mockRect(width: number, height: number): DOMRect {
    return {
      width,
      height,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      toJSON: () => ({}),
    };
  }

  it('applies styles directly when menu fits within viewport', () => {
    const menuEl = document.createElement('div');
    vi.spyOn(menuEl, 'getBoundingClientRect').mockReturnValue(mockRect(100, 100));
    document.body.appendChild(menuEl);

    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true });

    applyFixedMenuViewportFit(menuEl, 50, 50);

    expect(menuEl.style.left).toBe('50px');
    expect(menuEl.style.top).toBe('50px');
    expect(menuEl.style.maxHeight).toBe('');
    expect(menuEl.style.overflowY).toBe('');

    document.body.removeChild(menuEl);
  });

  it('adjusts position and applies maxHeight when menu exceeds viewport height', () => {
    const menuEl = document.createElement('div');
    vi.spyOn(menuEl, 'getBoundingClientRect').mockReturnValue(mockRect(100, 500));
    document.body.appendChild(menuEl);

    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 400, writable: true, configurable: true });

    applyFixedMenuViewportFit(menuEl, 50, 50);

    const pad = MENU_VIEWPORT_PADDING;
    const expectedMaxHeight = 400 - pad * 2;

    expect(menuEl.style.left).toBe('50px');
    expect(menuEl.style.top).toBe(`${pad}px`);
    expect(menuEl.style.maxHeight).toBe(`${expectedMaxHeight}px`);
    expect(menuEl.style.overflowY).toBe('auto');

    document.body.removeChild(menuEl);
  });

  it('shifts left when menu extends past right edge', () => {
    const menuEl = document.createElement('div');
    vi.spyOn(menuEl, 'getBoundingClientRect').mockReturnValue(mockRect(200, 100));
    document.body.appendChild(menuEl);

    Object.defineProperty(window, 'innerWidth', { value: 300, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true });

    applyFixedMenuViewportFit(menuEl, 250, 50);

    const pad = MENU_VIEWPORT_PADDING;
    const expectedLeft = Math.max(pad, 300 - 200 - pad);

    expect(menuEl.style.left).toBe(`${expectedLeft}px`);
    expect(menuEl.style.top).toBe('50px');

    document.body.removeChild(menuEl);
  });

  it('shifts top upward when menu extends past bottom edge', () => {
    const menuEl = document.createElement('div');
    vi.spyOn(menuEl, 'getBoundingClientRect').mockReturnValue(mockRect(100, 200));
    document.body.appendChild(menuEl);

    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 400, writable: true, configurable: true });

    applyFixedMenuViewportFit(menuEl, 50, 300);

    const pad = MENU_VIEWPORT_PADDING;
    const expectedTop = Math.max(pad, 400 - 200 - pad);

    expect(menuEl.style.left).toBe('50px');
    expect(menuEl.style.top).toBe(`${expectedTop}px`);
    expect(menuEl.style.maxHeight).toBe('');

    document.body.removeChild(menuEl);
  });
});
