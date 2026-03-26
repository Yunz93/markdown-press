export interface PaneLayoutMetrics {
  backdropPaddingX: number;
  backdropPaddingY: number;
  frameMaxWidth: number;
  sheetMaxWidth: number;
  contentPaddingX: number;
  contentPaddingTop: number;
  contentPaddingBottom: number;
  sheetRadius: number;
}

export type PaneDensity = 'comfortable' | 'compact';

function scale(value: number, multiplier: number): number {
  return Math.round(value * multiplier);
}

export function getPaneLayoutMetrics(width: number, density: PaneDensity): PaneLayoutMetrics {
  const safeWidth = Math.max(width || 0, 360);
  const densityScale = density === 'compact' ? 0.82 : 1;

  let metrics: PaneLayoutMetrics;

  if (safeWidth >= 1320) {
    metrics = {
      backdropPaddingX: 28,
      backdropPaddingY: 30,
      frameMaxWidth: 1240,
      sheetMaxWidth: 1080,
      contentPaddingX: 56,
      contentPaddingTop: 52,
      contentPaddingBottom: 72,
      sheetRadius: 28,
    };
  } else if (safeWidth >= 920) {
    metrics = {
      backdropPaddingX: 20,
      backdropPaddingY: 22,
      frameMaxWidth: 1080,
      sheetMaxWidth: 920,
      contentPaddingX: 40,
      contentPaddingTop: 44,
      contentPaddingBottom: 60,
      sheetRadius: 26,
    };
  } else {
    metrics = {
      backdropPaddingX: 12,
      backdropPaddingY: 14,
      frameMaxWidth: safeWidth,
      sheetMaxWidth: safeWidth,
      contentPaddingX: 24,
      contentPaddingTop: 34,
      contentPaddingBottom: 46,
      sheetRadius: 22,
    };
  }

  return {
    backdropPaddingX: scale(metrics.backdropPaddingX, densityScale),
    backdropPaddingY: scale(metrics.backdropPaddingY, densityScale),
    frameMaxWidth: Math.min(metrics.frameMaxWidth, safeWidth),
    sheetMaxWidth: Math.min(metrics.sheetMaxWidth, safeWidth),
    contentPaddingX: scale(metrics.contentPaddingX, densityScale),
    contentPaddingTop: scale(metrics.contentPaddingTop, densityScale),
    contentPaddingBottom: scale(metrics.contentPaddingBottom, densityScale),
    sheetRadius: scale(metrics.sheetRadius, density === 'compact' ? 0.92 : 1),
  };
}
