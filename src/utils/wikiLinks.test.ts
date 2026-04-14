import { describe, it, expect } from 'vitest';
import { parseWikiLinkReference, extractWikiNoteFragment, resolveWikiLinkFile } from './wikiLinks';
import type { FileNode } from '../types';

describe('parseWikiLinkReference', () => {
  it('parses simple wiki link', () => {
    const result = parseWikiLinkReference('My Note');
    expect(result.path).toBe('My Note');
    expect(result.subpath).toBe('');
    expect(result.subpathType).toBeNull();
    expect(result.displayText).toBe('My Note');
  });

  it('parses wiki link with alias', () => {
    const result = parseWikiLinkReference('My Note|display text');
    expect(result.path).toBe('My Note');
    expect(result.displayText).toBe('display text');
  });

  it('parses wiki link with heading subpath', () => {
    const result = parseWikiLinkReference('My Note#Section');
    expect(result.path).toBe('My Note');
    expect(result.subpath).toBe('Section');
    expect(result.subpathType).toBe('heading');
  });

  it('parses wiki link with block reference', () => {
    const result = parseWikiLinkReference('My Note#^block-id');
    expect(result.path).toBe('My Note');
    expect(result.subpath).toBe('^block-id');
    expect(result.subpathType).toBe('block');
  });

  it('parses heading-only reference', () => {
    const result = parseWikiLinkReference('#Section');
    expect(result.path).toBe('');
    expect(result.subpath).toBe('Section');
    expect(result.subpathType).toBe('heading');
  });

  it('strips markdown extension from display text', () => {
    const result = parseWikiLinkReference('notes/My Note.md');
    expect(result.displayText).toBe('My Note');
  });

  it('parses embed with size dimensions', () => {
    const result = parseWikiLinkReference('image.png|300x200', { embed: true });
    expect(result.embedSize).toEqual({ width: 300, height: 200 });
  });

  it('parses embed with width-only dimension', () => {
    const result = parseWikiLinkReference('image.png|300', { embed: true });
    expect(result.embedSize).toEqual({ width: 300, height: undefined });
  });

  it('does not parse size for non-embed links', () => {
    const result = parseWikiLinkReference('note|300x200');
    expect(result.embedSize).toBeNull();
    expect(result.displayText).toBe('300x200');
  });
});

describe('extractWikiNoteFragment', () => {
  const sampleContent = `---
title: Test
---

# Introduction

This is the intro.

## Details

Some details here.

## Summary

Final summary.`;

  it('extracts full body without subpath', () => {
    const result = extractWikiNoteFragment(sampleContent, 'Test');
    expect(result.markdown).toContain('# Introduction');
    expect(result.markdown).toContain('## Summary');
  });

  it('extracts heading section', () => {
    const result = extractWikiNoteFragment(sampleContent, 'Test#Details');
    expect(result.markdown).toContain('Details');
    expect(result.markdown).toContain('Some details here.');
    expect(result.markdown).not.toContain('Final summary');
  });

  it('returns null for non-existent heading', () => {
    const result = extractWikiNoteFragment(sampleContent, 'Test#NonExistent');
    expect(result.markdown).toBeNull();
  });

  it('builds title from heading subpath', () => {
    const result = extractWikiNoteFragment(sampleContent, 'Test#Details');
    expect(result.title).toBe('Details');
  });
});

describe('resolveWikiLinkFile', () => {
  const files: FileNode[] = [
    { id: '/root/notes/hello.md', name: 'hello.md', path: '/root/notes/hello.md', type: 'file' },
    { id: '/root/notes/world.md', name: 'world.md', path: '/root/notes/world.md', type: 'file' },
    {
      id: '/root/folder',
      name: 'folder',
      path: '/root/folder',
      type: 'folder',
      children: [
        { id: '/root/folder/deep.md', name: 'deep.md', path: '/root/folder/deep.md', type: 'file' },
      ],
    },
  ];

  it('resolves by basename', () => {
    const result = resolveWikiLinkFile(files, 'hello', '/root');
    expect(result?.name).toBe('hello.md');
  });

  it('resolves by relative path', () => {
    const result = resolveWikiLinkFile(files, 'notes/hello', '/root');
    expect(result?.name).toBe('hello.md');
  });

  it('resolves nested file by basename', () => {
    const result = resolveWikiLinkFile(files, 'deep', '/root');
    expect(result?.name).toBe('deep.md');
  });

  it('returns null for non-existent file', () => {
    const result = resolveWikiLinkFile(files, 'nonexistent', '/root');
    expect(result).toBeNull();
  });

  it('strips .md extension from target', () => {
    const result = resolveWikiLinkFile(files, 'hello.md', '/root');
    expect(result?.name).toBe('hello.md');
  });

  it('handles heading subpath in target', () => {
    const result = resolveWikiLinkFile(files, 'hello#Section', '/root');
    expect(result?.name).toBe('hello.md');
  });
});
