import { describe, expect, it } from 'vitest';
import { buildMarkdownDestination, parseMarkdownDestination, stripMarkdownDestination } from './markdownDestination';

describe('markdownDestination', () => {
  it('parses angle-bracket paths with titles', () => {
    expect(parseMarkdownDestination('<../resources/my file.png> "cover title"')).toEqual({
      path: '../resources/my file.png',
      angleBrackets: true,
      title: '"cover title"',
    });
  });

  it('parses plain paths with titles', () => {
    expect(parseMarkdownDestination('../resources/cover.png "cover title"')).toEqual({
      path: '../resources/cover.png',
      angleBrackets: false,
      title: '"cover title"',
    });
  });

  it('rebuilds angle-bracket paths without dropping titles', () => {
    expect(buildMarkdownDestination('../resources/new/my file.png', {
      path: '../resources/my file.png',
      angleBrackets: true,
      title: '"cover title"',
    })).toBe('<../resources/new/my file.png> "cover title"');
  });

  it('strips angle-bracket destinations with titles to the path', () => {
    expect(stripMarkdownDestination('<../resources/my file.png> "cover title"')).toBe('../resources/my file.png');
  });
});
