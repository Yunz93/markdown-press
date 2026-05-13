import { describe, it, expect } from 'vitest';
import { computeSafePdfRenderScale } from './exportRasterHost';

describe('computeSafePdfRenderScale', () => {
  const SAFE_LIMIT = 14000;

  it('returns the requested scale for short documents that fit comfortably', () => {
    const scale = computeSafePdfRenderScale(832, 4000, 2.5);
    expect(scale).toBeCloseTo(2.5, 5);
  });

  it('clamps the scale when the height-side canvas would exceed the safe limit', () => {
    // 832 wide, 8000 tall, scale 2.5 -> 20000px canvas height: must clamp.
    const scale = computeSafePdfRenderScale(832, 8000, 2.5);
    expect(scale).toBeLessThan(2.5);
    expect(scale * 8000).toBeLessThanOrEqual(SAFE_LIMIT + 1e-6);
  });

  it('keeps the worst-case canvas dimension under the limit even for very long docs', () => {
    // 832 wide, 24000 tall, scale 2.5 -> 60000px canvas height (would crash on Windows WebView2).
    const containerWidth = 832;
    const containerHeight = 24000;
    const scale = computeSafePdfRenderScale(containerWidth, containerHeight, 2.5);
    const worstDimension = Math.max(containerWidth * scale, containerHeight * scale);
    expect(worstDimension).toBeLessThanOrEqual(SAFE_LIMIT + 1e-6);
  });

  it('clamps the worst-case canvas dimension under the limit even for very long docs', () => {
    // Container 832 wide, 24000 tall: scale 1 still produces a 24000px canvas
    // which exceeds the cap, so the helper must drop below 1 to stay safe.
    const containerWidth = 832;
    const containerHeight = 24000;
    const scale = computeSafePdfRenderScale(containerWidth, containerHeight, 2.5);
    const worstDimension = Math.max(containerWidth * scale, containerHeight * scale);
    expect(worstDimension).toBeLessThanOrEqual(SAFE_LIMIT + 1e-6);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0.5);
  });

  it('never falls below the absolute minimum scale floor', () => {
    // Pathological height: pretend a document is 1,000,000 px tall.
    const scale = computeSafePdfRenderScale(832, 1_000_000, 2.5);
    expect(scale).toBeGreaterThanOrEqual(0.1);
  });

  it('handles zero/negative dimensions defensively', () => {
    expect(computeSafePdfRenderScale(0, 0, 2.5)).toBe(2.5);
    expect(computeSafePdfRenderScale(-100, -100, 2.5)).toBe(2.5);
  });

  it('respects an explicit max-canvas-dimension override', () => {
    const scale = computeSafePdfRenderScale(832, 8000, 2.5, 8000);
    expect(scale * 8000).toBeLessThanOrEqual(8000 + 1e-6);
  });
});
