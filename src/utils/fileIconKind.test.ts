import { describe, expect, it } from 'vitest';
import { getFileIconKind } from './fileIconKind';

describe('getFileIconKind', () => {
  it('classifies markdown and related', () => {
    expect(getFileIconKind('note.md')).toBe('markdown');
    expect(getFileIconKind('page.MDX')).toBe('markdown');
    expect(getFileIconKind('long.markdown')).toBe('markdown');
  });

  it('classifies images and pdf', () => {
    expect(getFileIconKind('a.PNG')).toBe('image');
    expect(getFileIconKind('x.webp')).toBe('image');
    expect(getFileIconKind('doc.pdf')).toBe('pdf');
  });

  it('classifies archives and media', () => {
    expect(getFileIconKind('b.zip')).toBe('archive');
    expect(getFileIconKind('c.mp3')).toBe('audio');
    expect(getFileIconKind('d.mp4')).toBe('video');
  });

  it('defaults for unknown or no extension', () => {
    expect(getFileIconKind('Makefile')).toBe('file');
    expect(getFileIconKind('.env')).toBe('file');
    expect(getFileIconKind('readme')).toBe('file');
  });
});
