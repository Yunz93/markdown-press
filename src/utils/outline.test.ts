import { describe, it, expect } from 'vitest';
import { createHeadingSlug, createUniqueHeadingId, parseHeadings, flattenHeadingNodes } from './outline';

describe('createHeadingSlug', () => {
  it('converts to lowercase with hyphens', () => {
    expect(createHeadingSlug('Hello World')).toBe('hello-world');
  });

  it('handles Chinese characters', () => {
    expect(createHeadingSlug('你好世界')).toBe('你好世界');
  });

  it('removes special characters', () => {
    expect(createHeadingSlug('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces', () => {
    expect(createHeadingSlug('Hello   World')).toBe('hello-world');
  });

  it('returns section for empty text after cleanup', () => {
    expect(createHeadingSlug('!@#$%')).toBe('section');
  });

  it('trims whitespace', () => {
    expect(createHeadingSlug('  Hello  ')).toBe('hello');
  });
});

describe('createUniqueHeadingId', () => {
  it('returns base slug for first occurrence', () => {
    const counts = new Map<string, number>();
    expect(createUniqueHeadingId('Hello', counts)).toBe('hello');
  });

  it('appends count for duplicate headings', () => {
    const counts = new Map<string, number>();
    createUniqueHeadingId('Hello', counts);
    expect(createUniqueHeadingId('Hello', counts)).toBe('hello-2');
    expect(createUniqueHeadingId('Hello', counts)).toBe('hello-3');
  });

  it('tracks different headings separately', () => {
    const counts = new Map<string, number>();
    expect(createUniqueHeadingId('A', counts)).toBe('a');
    expect(createUniqueHeadingId('B', counts)).toBe('b');
    expect(createUniqueHeadingId('A', counts)).toBe('a-2');
  });
});

describe('parseHeadings', () => {
  it('returns empty array for content without headings', () => {
    expect(parseHeadings('No headings here')).toEqual([]);
  });

  it('parses flat headings', () => {
    const content = '# Title\n\n## Section A\n\n## Section B';
    const headings = parseHeadings(content);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Title');
    expect(headings[0].children).toHaveLength(2);
    expect(headings[0].children[0].text).toBe('Section A');
    expect(headings[0].children[1].text).toBe('Section B');
  });

  it('builds nested hierarchy', () => {
    const content = '# H1\n## H2\n### H3\n## H2b';
    const headings = parseHeadings(content);
    expect(headings[0].text).toBe('H1');
    expect(headings[0].children[0].text).toBe('H2');
    expect(headings[0].children[0].children[0].text).toBe('H3');
    expect(headings[0].children[1].text).toBe('H2b');
  });

  it('skips headings in frontmatter', () => {
    const content = '---\ntitle: Test\n---\n\n# Real Heading';
    const headings = parseHeadings(content);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Real Heading');
  });

  it('handles duplicate headings with unique IDs', () => {
    const content = '## Section\n\n## Section\n\n## Section';
    const headings = parseHeadings(content);
    const ids = headings.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes line numbers', () => {
    const content = '# Title\n\nParagraph\n\n## Section';
    const headings = parseHeadings(content);
    expect(headings[0].line).toBe(1);
    expect(headings[0].children[0].line).toBe(5);
  });
});

describe('flattenHeadingNodes', () => {
  it('flattens nested headings', () => {
    const headings = parseHeadings('# A\n## B\n### C\n## D');
    const flat = flattenHeadingNodes(headings);
    expect(flat.map((h) => h.text)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns empty array for empty input', () => {
    expect(flattenHeadingNodes([])).toEqual([]);
  });
});
