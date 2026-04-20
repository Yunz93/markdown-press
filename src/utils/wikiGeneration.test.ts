import { describe, expect, it } from 'vitest';
import {
  buildWikiBacklink,
  buildWikiSupplementSections,
  normalizeWikiFolder,
  sanitizeWikiArchiveSegment,
  stripDuplicateWikiSupplementSections,
} from './wikiGeneration';

describe('normalizeWikiFolder', () => {
  it('falls back to wiki when empty', () => {
    expect(normalizeWikiFolder('')).toBe('wiki');
    expect(normalizeWikiFolder(undefined)).toBe('wiki');
  });

  it('keeps safe relative paths', () => {
    expect(normalizeWikiFolder('wiki')).toBe('wiki');
    expect(normalizeWikiFolder('notes/wiki')).toBe('notes/wiki');
    expect(normalizeWikiFolder('./wiki/archive')).toBe('wiki/archive');
  });

  it('falls back when traversal or absolute paths are provided', () => {
    expect(normalizeWikiFolder('../wiki')).toBe('wiki');
    expect(normalizeWikiFolder('/tmp/wiki')).toBe('wiki');
    expect(normalizeWikiFolder('C:\\wiki')).toBe('wiki');
  });
});

describe('sanitizeWikiArchiveSegment', () => {
  it('removes invalid filesystem characters', () => {
    expect(sanitizeWikiArchiveSegment('产品/设计:*?', '未分类')).toBe('产品 设计');
  });

  it('falls back when category is empty after sanitization', () => {
    expect(sanitizeWikiArchiveSegment('   ', '未分类')).toBe('未分类');
  });
});

describe('buildWikiSupplementSections', () => {
  it('builds localized Chinese sections', () => {
    const output = buildWikiSupplementSections(
      'zh-CN',
      [{ title: 'OpenAI Docs', url: 'https://platform.openai.com/docs', note: '错误码说明' }],
      ['结合当前文档上下文补充了解释。']
    );

    expect(output).toContain('## 参考资料');
    expect(output).toContain('OpenAI Docs - https://platform.openai.com/docs - 错误码说明');
    expect(output).toContain('## 引用说明');
  });

  it('builds localized English sections', () => {
    const output = buildWikiSupplementSections(
      'en',
      [{ title: 'Source A' }],
      ['Used to explain the background.']
    );

    expect(output).toContain('## References');
    expect(output).toContain('## Citation Notes');
  });

  it('returns empty string when no supplement data exists', () => {
    expect(buildWikiSupplementSections('zh-CN', [], [])).toBe('');
  });
});

describe('buildWikiBacklink', () => {
  it('localizes the backlink label for Chinese entries', () => {
    expect(buildWikiBacklink('zh-CN', '原始文档')).toBe('\n\n---\n\n关联原文：[[原始文档]]\n');
  });

  it('localizes the backlink label for English entries', () => {
    expect(buildWikiBacklink('en', 'Source Note')).toBe('\n\n---\n\nRelated source: [[Source Note]]\n');
  });

  it('returns a trailing newline when no backlink target exists', () => {
    expect(buildWikiBacklink('en', '')).toBe('\n');
  });
});

describe('stripDuplicateWikiSupplementSections', () => {
  it('removes duplicate Chinese references block from markdown', () => {
    const input = `# Title

Lead paragraph.

## 关键要点

Body.

## 参考资料

- Source A

## 引用说明

- Note A`;

    expect(stripDuplicateWikiSupplementSections(input)).toBe(`# Title

Lead paragraph.

## 关键要点

Body.`);
  });

  it('removes duplicate English references block from markdown', () => {
    const input = `# Title

Lead paragraph.

## Background

Body.

## References

- Source A`;

    expect(stripDuplicateWikiSupplementSections(input)).toBe(`# Title

Lead paragraph.

## Background

Body.`);
  });
});
