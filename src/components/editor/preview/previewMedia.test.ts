import { describe, expect, it } from 'vitest';
import { hasWikiEmbedsInHtml } from './previewMedia';

describe('hasWikiEmbedsInHtml', () => {
  it('detects embed markup regardless of class token order', () => {
    expect(
      hasWikiEmbedsInHtml(
        '<a class="markdown-embed markdown-link" href="#" data-wiki-embed="true"></a>',
      ),
    ).toBe(true);
  });

  it('detects data-wiki-embed without requiring ="true" substring', () => {
    expect(
      hasWikiEmbedsInHtml('<a data-wiki-embed href="#" class="markdown-link markdown-embed"></a>'),
    ).toBe(true);
  });

  it('is false for plain wikilinks', () => {
    expect(hasWikiEmbedsInHtml('<a class="markdown-wikilink" data-wikilink="X"></a>')).toBe(false);
  });
});
