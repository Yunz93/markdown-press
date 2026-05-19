/** @vitest-environment happy-dom */

import { describe, expect, it } from 'vitest';
import {
  configurePreviewImageElement,
  getLocalPreviewLinkTarget,
  hasWikiEmbedsInHtml,
  isLocalPreviewLinkHref,
} from './previewMedia';

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

describe('configurePreviewImageElement', () => {
  it('uses lazy async image defaults for preview images', () => {
    const image = document.createElement('img');

    configurePreviewImageElement(image, 'resolved.png', 'poster.png');

    expect(image.getAttribute('src')).toBe('resolved.png');
    expect(image.getAttribute('data-original-src')).toBe('poster.png');
    expect(image.getAttribute('decoding')).toBe('async');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.getAttribute('fetchpriority')).toBe('auto');
  });
});

describe('local preview links', () => {
  it('detects relative PDF links as local links handled by the app', () => {
    expect(isLocalPreviewLinkHref('../papers/saycan.pdf')).toBe(true);
    expect(isLocalPreviewLinkHref('papers/saycan.pdf#page=2')).toBe(true);
  });

  it('does not treat external URLs or hash anchors as local files', () => {
    expect(isLocalPreviewLinkHref('https://example.com/paper.pdf')).toBe(false);
    expect(isLocalPreviewLinkHref('#references')).toBe(false);
    expect(isLocalPreviewLinkHref('//example.com/paper.pdf')).toBe(false);
  });

  it('strips PDF viewer hash and query suffixes before resolving the file', () => {
    expect(getLocalPreviewLinkTarget('../papers/saycan.pdf#page=2')).toBe('../papers/saycan.pdf');
    expect(getLocalPreviewLinkTarget('../papers/saycan.pdf?download=1')).toBe('../papers/saycan.pdf');
  });
});
