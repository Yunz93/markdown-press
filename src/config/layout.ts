import { ViewMode } from '../types';

/**
 * Layout configuration constants
 * Centralized management of all layout-related magic numbers
 */

export const LAYOUT = {
  /** Sidebar dimensions and constraints */
  SIDEBAR: {
    DEFAULT_WIDTH: 240,
    MIN_WIDTH: 240,
    MAX_WIDTH: 420,
    RESPONSIVE_MIN_WIDTH: 160,
  },

  /** Outline panel dimensions and constraints */
  OUTLINE: {
    DEFAULT_WIDTH: 240,
    MIN_WIDTH: 180,
    MAX_WIDTH: 360,
  },

  /** Minimum workspace widths for different view modes */
  WORKSPACE: {
    SINGLE_VIEW_MIN: 760,
    SPLIT_MIN: 920,
    WITH_OUTLINE: {
      EDITOR: 620,
      PREVIEW: 620,
      SPLIT: 720,
    },
  },

  /** Gap sizes between panels */
  GAP: {
    OUTLINE_PANEL: 32,
    SHELL_EDGE: 24,
  },

  /** Split pane constraints */
  SPLIT_PANE: {
    MIN_WIDTH: 360,
  },

  /** Editor settings */
  EDITOR: {
    LINE_HEIGHT: 1.95,
  },

  /** Scroll sync thresholds */
  SCROLL: {
    SYNC_THRESHOLD: 5,
    EMIT_THRESHOLD: 0.001,
  },

  /** Heading scroll animation */
  HEADING_SCROLL: {
    RETRY_DELAYS_MS: [48, 140],
    ALIGN_TOP_RATIO: 0.18,
  },

  /** Storage keys for persisted layout settings */
  STORAGE_KEYS: {
    SIDEBAR_WIDTH: 'markdown-press.sidebar-width',
    OUTLINE_WIDTH: 'markdown-press.outline-width',
  },
} as const;

/**
 * Helper function to clamp a value within min/max bounds
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Get stored panel width from localStorage with validation
 */
export function getStoredPanelWidth(
  storageKey: string,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof window === 'undefined') return fallback;

  const rawValue = window.localStorage.getItem(storageKey);
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;

  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return clamp(parsedValue, min, max);
}

/**
 * Calculate minimum workspace width based on view mode
 */
export function getMinimumWorkspaceWidth(viewMode: ViewMode): number {
  return viewMode === ViewMode.SPLIT
    ? LAYOUT.WORKSPACE.SPLIT_MIN
    : LAYOUT.WORKSPACE.SINGLE_VIEW_MIN;
}

/**
 * Calculate minimum workspace width with outline panel
 */
export function getMinimumWorkspaceWidthWithOutline(
  viewMode: ViewMode
): number {
  if (viewMode === ViewMode.SPLIT) {
    return LAYOUT.WORKSPACE.WITH_OUTLINE.SPLIT;
  }

  if (viewMode === ViewMode.PREVIEW) {
    return LAYOUT.WORKSPACE.WITH_OUTLINE.PREVIEW;
  }

  return LAYOUT.WORKSPACE.WITH_OUTLINE.EDITOR;
}
