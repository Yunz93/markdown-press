/** Padding from viewport edges when clamping a fixed-position context menu. */
export const MENU_VIEWPORT_PADDING = 8;

export interface MenuAnchor {
  left: number;
  top: number;
}

export interface MenuBox {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface MenuViewportFit {
  left: number;
  top: number;
  maxHeight?: number;
}

/**
 * Computes position (and optional max-height) so a fixed menu stays within the viewport.
 */
export function computeMenuViewportFit(
  anchor: MenuAnchor,
  menu: MenuBox,
  viewport: ViewportSize,
  padding = MENU_VIEWPORT_PADDING
): MenuViewportFit {
  const maxInnerHeight = viewport.height - padding * 2;

  let left = anchor.left;
  let top = anchor.top;

  if (left + menu.width > viewport.width - padding) {
    left = Math.max(padding, viewport.width - menu.width - padding);
  }

  if (menu.height > maxInnerHeight) {
    return {
      left,
      top: padding,
      maxHeight: maxInnerHeight,
    };
  }

  if (top + menu.height > viewport.height - padding) {
    top = Math.max(padding, viewport.height - menu.height - padding);
  }

  return { left, top };
}

/**
 * Places the menu at the anchor, measures it, then applies viewport clamping via inline styles.
 */
export function applyFixedMenuViewportFit(
  menuEl: HTMLElement,
  anchorX: number,
  anchorY: number
): void {
  menuEl.style.left = `${anchorX}px`;
  menuEl.style.top = `${anchorY}px`;
  menuEl.style.maxHeight = '';
  menuEl.style.overflowY = '';

  const rect = menuEl.getBoundingClientRect();
  const fit = computeMenuViewportFit(
    { left: anchorX, top: anchorY },
    { width: rect.width, height: rect.height },
    { width: window.innerWidth, height: window.innerHeight }
  );

  menuEl.style.left = `${fit.left}px`;
  menuEl.style.top = `${fit.top}px`;
  if (fit.maxHeight !== undefined) {
    menuEl.style.maxHeight = `${fit.maxHeight}px`;
    menuEl.style.overflowY = 'auto';
  }
}
