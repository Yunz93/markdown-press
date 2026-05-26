/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { buildWikiPreviewMarkup } from './wikiPreviewMarkup';

describe('wikiPreviewMarkup', () => {
  it('adds preview-pane-document to enter preview.css typography domain', () => {
    const el = buildWikiPreviewMarkup({
      title: 'Title',
      subtitle: 'Sub',
      html: '<h1>Heading</h1><p>Para</p>',
    });

    const article = el.querySelector('article');
    expect(article).toBeTruthy();

    expect(article?.className).toContain('markdown-body');
    expect(article?.className).toContain('wiki-link-hover-preview-body');
    expect(article?.className).toContain('preview-pane-document');

    expect(el.innerHTML).toContain('<h1>Heading</h1>');
    expect(el.innerHTML).toContain('<p>Para</p>');
  });

  it('builds wiki hover preview without subtitle', () => {
    const el = buildWikiPreviewMarkup({
      title: 'Only Title',
      html: '<p>Snippet</p>',
    });

    expect(el.querySelector('.wiki-link-hover-preview-subtitle')).toBeNull();
    expect(el.querySelector('.wiki-link-hover-preview-title')?.textContent).toBe('Only Title');
  });
});

