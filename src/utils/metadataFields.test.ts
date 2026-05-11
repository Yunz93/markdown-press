import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { refreshDocumentUpdateTime } from './metadataFields';

describe('refreshDocumentUpdateTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T12:34:56.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes timestamp keys in place without rewriting unrelated frontmatter layout', () => {
    const doc = [
      '---',
      'category: notes',
      '',
      '# keep me',
      'date modified: 2020-01-01 00:00:00',
      'slug: my-post',
      '---',
      '',
      'Hello body',
    ].join('\n');

    const next = refreshDocumentUpdateTime(doc);

    expect(next).toContain('category: notes');
    expect(next).toContain('\n\n# keep me\n');
    expect(next).toContain('slug: my-post');
    expect(next.endsWith('\n\nHello body')).toBe(true);
    expect(next).toMatch(/date modified: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(next).not.toContain('2020-01-01 00:00:00');
  });

  it('preserves CRLF line endings inside the frontmatter block when present', () => {
    const doc = '---\r\ndate modified: 2020-01-01\r\n---\r\n\r\nBody';
    const next = refreshDocumentUpdateTime(doc);

    expect(next.startsWith('---\r\n')).toBe(true);
    expect(next).toContain('\r\n---\r\n');
    expect(next.endsWith('\r\n\r\nBody')).toBe(true);
  });

  it('falls back to full round-trip when a refresh key is not on a replaceable single line', () => {
    const doc = [
      '---',
      'update_time: >',
      '  2020-01-01',
      'slug: x',
      '---',
      '',
      'Body',
    ].join('\n');

    const next = refreshDocumentUpdateTime(doc);

    expect(next).toContain('slug: x');
    expect(next).toMatch(/update_time:/);
    expect(next.endsWith('\n\nBody')).toBe(true);
    expect(next).not.toContain('2020-01-01');
  });
});
