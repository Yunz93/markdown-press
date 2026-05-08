import { describe, expect, it } from 'vitest';
import { markdownHighlightStyle } from './decorations';

describe('markdownHighlightStyle headings', () => {
  it('emits distinct classes for heading levels', () => {
    const specs = (markdownHighlightStyle as unknown as { specs?: Array<{ class?: string }> }).specs;
    expect(Array.isArray(specs)).toBe(true);

    const classes = (specs ?? []).map((s) => s.class).filter(Boolean).join(' ');
    expect(classes).toContain('mp-tok-heading-1');
    expect(classes).toContain('mp-tok-heading-2');
    expect(classes).toContain('mp-tok-heading-3');
    expect(classes).toContain('mp-tok-heading-4');
    expect(classes).toContain('mp-tok-heading-5');
    expect(classes).toContain('mp-tok-heading-6');
  });

  it('emits a dedicated class for inline code', () => {
    const specs = (markdownHighlightStyle as unknown as { specs?: Array<{ class?: string }> }).specs;
    expect(Array.isArray(specs)).toBe(true);

    const classes = (specs ?? []).map((s) => s.class).filter(Boolean).join(' ');
    expect(classes).toContain('mp-tok-inline-code');
  });
});

