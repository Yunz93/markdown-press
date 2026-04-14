import { describe, it, expect } from 'vitest';
import { parseFrontmatter, generateFrontmatter, updateFrontmatter, removeFrontmatter, getFrontmatterValue, setFrontmatterValue } from './frontmatter';

describe('parseFrontmatter', () => {
  it('returns null frontmatter for empty content', () => {
    const result = parseFrontmatter('');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('');
  });

  it('returns null frontmatter for content without frontmatter', () => {
    const result = parseFrontmatter('# Hello\n\nThis is content');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('# Hello\n\nThis is content');
  });

  it('parses simple frontmatter', () => {
    const content = '---\ntitle: Hello World\n---\n\n# Body';
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({ title: 'Hello World' });
    expect(result.body).toBe('# Body');
  });

  it('parses frontmatter with multiple fields', () => {
    const content = '---\ntitle: Test\ndate: 2026-01-01\ntags:\n  - a\n  - b\n---\n\nBody';
    const result = parseFrontmatter(content);
    expect(result.frontmatter?.title).toBe('Test');
    expect(result.frontmatter?.date).toBe('2026-01-01');
    expect(result.frontmatter?.tags).toEqual(['a', 'b']);
  });

  it('normalizes Date objects to ISO date strings', () => {
    const content = '---\ncreate_time: 2026-04-14\n---\n\nBody';
    const result = parseFrontmatter(content);
    expect(typeof result.frontmatter?.create_time).toBe('string');
  });

  it('handles invalid YAML gracefully', () => {
    const content = '---\n: invalid yaml [\n---\n\nBody';
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
  });

  it('handles frontmatter with Windows line endings', () => {
    const content = '---\r\ntitle: Hello\r\n---\r\n\r\nBody';
    const result = parseFrontmatter(content);
    expect(result.frontmatter?.title).toBe('Hello');
    expect(result.body).toBe('Body');
  });
});

describe('generateFrontmatter', () => {
  it('returns empty string for empty object', () => {
    expect(generateFrontmatter({})).toBe('');
  });

  it('generates simple frontmatter', () => {
    const result = generateFrontmatter({ title: 'Hello' });
    expect(result).toBe('---\ntitle: Hello\n---\n\n');
  });

  it('skips undefined values', () => {
    const result = generateFrontmatter({ title: 'Hello', hidden: undefined });
    expect(result).not.toContain('hidden');
  });

  it('handles array values', () => {
    const result = generateFrontmatter({ tags: ['a', 'b'] });
    expect(result).toContain('tags:');
    expect(result).toContain('- a');
    expect(result).toContain('- b');
  });

  it('quotes strings that look like booleans', () => {
    const result = generateFrontmatter({ status: 'true' });
    expect(result).toContain('"true"');
  });

  it('quotes strings that look like dates', () => {
    const result = generateFrontmatter({ date: '2026-01-01' });
    expect(result).toContain('"2026-01-01"');
  });
});

describe('updateFrontmatter', () => {
  it('adds frontmatter to content without it', () => {
    const result = updateFrontmatter('# Hello', { title: 'Test' });
    expect(result).toMatch(/^---\ntitle: Test\n---\n/);
    expect(result).toContain('# Hello');
  });

  it('merges with existing frontmatter', () => {
    const content = '---\ntitle: Old\n---\n\n# Body';
    const result = updateFrontmatter(content, { slug: 'new' });
    const parsed = parseFrontmatter(result);
    expect(parsed.frontmatter?.title).toBe('Old');
    expect(parsed.frontmatter?.slug).toBe('new');
  });

  it('overwrites existing frontmatter fields', () => {
    const content = '---\ntitle: Old\n---\n\n# Body';
    const result = updateFrontmatter(content, { title: 'New' });
    const parsed = parseFrontmatter(result);
    expect(parsed.frontmatter?.title).toBe('New');
  });
});

describe('removeFrontmatter', () => {
  it('removes frontmatter and returns body', () => {
    const content = '---\ntitle: Test\n---\n\n# Body\n\nContent';
    expect(removeFrontmatter(content)).toBe('# Body\n\nContent');
  });

  it('returns content unchanged if no frontmatter', () => {
    expect(removeFrontmatter('# Hello')).toBe('# Hello');
  });
});

describe('getFrontmatterValue', () => {
  it('returns value for existing key', () => {
    const content = '---\ntitle: Hello\n---\n\nBody';
    expect(getFrontmatterValue(content, 'title')).toBe('Hello');
  });

  it('returns null for missing key', () => {
    const content = '---\ntitle: Hello\n---\n\nBody';
    expect(getFrontmatterValue(content, 'missing')).toBeNull();
  });

  it('returns null for content without frontmatter', () => {
    expect(getFrontmatterValue('# Hello', 'title')).toBeNull();
  });
});

describe('setFrontmatterValue', () => {
  it('sets a new value in existing frontmatter', () => {
    const content = '---\ntitle: Hello\n---\n\nBody';
    const result = setFrontmatterValue(content, 'slug', 'hello-world');
    const parsed = parseFrontmatter(result);
    expect(parsed.frontmatter?.slug).toBe('hello-world');
    expect(parsed.frontmatter?.title).toBe('Hello');
  });

  it('creates frontmatter if none exists', () => {
    const result = setFrontmatterValue('# Body', 'title', 'New');
    const parsed = parseFrontmatter(result);
    expect(parsed.frontmatter?.title).toBe('New');
  });
});
