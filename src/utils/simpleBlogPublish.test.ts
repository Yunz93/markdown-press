import { describe, expect, it } from 'vitest';
import { prepareSimpleBlogPublish } from './simpleBlogPublish';

describe('prepareSimpleBlogPublish', () => {
  it('writes the selected markdown style preset into published frontmatter', async () => {
    const prepared = await prepareSimpleBlogPublish({
      files: [],
      currentFilePath: '/notes/styled-post.md',
      markdownContent: `---
title: Styled Post
---

正文`,
      markdownStylePreset: 'topaz',
    });

    expect(prepared.markdownContent).toContain('markdown_style: topaz');
  });
});
