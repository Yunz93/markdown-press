import { describe, expect, it } from 'vitest';
import { formatMarkdownForSave } from './markdownFormat';

describe('hunt list continuation', () => {
  it('format-on-save: list item paragraph continuation should not gain a bullet', () => {
    const input = ['- 华为是家伟大的公司。', '  这么多年，', '- 华为是家温暖的公司。', ''].join('\n');
    const out = formatMarkdownForSave(input, { orderedListMode: 'strict' });
    expect(out).toContain('  这么多年，');
    expect(out).not.toMatch(/\n- 这么多年，/);
  });
});
