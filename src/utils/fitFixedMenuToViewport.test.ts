import { describe, it, expect } from 'vitest';
import { computeMenuViewportFit, MENU_VIEWPORT_PADDING } from './fitFixedMenuToViewport';

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
