import { describe, it, expect } from 'vitest';
import { countLines, getFileMetrics, isLargeFile } from './performance';

describe('countLines', () => {
  it('matches split-based line count for non-empty content', () => {
    const samples = ['a', 'a\nb', 'a\nb\n', '\n\nfoo'];
    for (const s of samples) {
      expect(countLines(s)).toBe(s.split('\n').length);
    }
  });

  it('returns 0 for empty string (metrics treat empty as zero lines)', () => {
    expect(countLines('')).toBe(0);
  });
});

describe('getFileMetrics', () => {
  it('reports zero lines for empty content', () => {
    expect(getFileMetrics('')).toEqual({ lines: 0, chars: 0, isLarge: false });
  });
});

describe('isLargeFile', () => {
  it('returns false for empty content', () => {
    expect(isLargeFile('')).toBe(false);
  });
});
