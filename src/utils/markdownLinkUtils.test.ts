import { describe, expect, it } from 'vitest';
import { extractAttachmentTargets } from './markdownLinkUtils';

describe('extractAttachmentTargets', () => {
  it('extracts angle-bracket markdown destinations with titles', () => {
    expect(
      extractAttachmentTargets('![cover](<../resources/my file.png> "cover title")')
    ).toEqual(['../resources/my file.png']);
  });

  it('extracts plain markdown destinations with titles', () => {
    expect(
      extractAttachmentTargets('![cover](../resources/cover.png "cover title")')
    ).toEqual(['../resources/cover.png']);
  });
});
