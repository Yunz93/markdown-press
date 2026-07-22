import { describe, expect, it } from 'vitest';
import {
  applySimpleBlogPublishInput,
  extractSimpleBlogPublishDefaults,
  prepareSimpleBlogPublish,
} from './simpleBlogPublish';

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

describe('extractSimpleBlogPublishDefaults', () => {
  it('prefills article metadata from frontmatter', () => {
    const defaults = extractSimpleBlogPublishDefaults(
      `---
title: Hello World
slug: hello
aliases:
  - hi
---

body`,
      '/notes/hello-world.md',
    );

    expect(defaults).toEqual({
      title: 'Hello World',
      slug: 'hello',
      aliases: 'hi',
    });
  });
});

describe('applySimpleBlogPublishInput', () => {
  it('writes title slug aliases and clears empty slug', () => {
    const next = applySimpleBlogPublishInput(
      `---
title: Old
slug: old-slug
---

body`,
      {
        title: 'New Title',
        slug: '',
        aliases: 'a, b',
      },
    );

    expect(next).toContain('title: New Title');
    expect(next).toContain('aliases:');
    expect(next).toContain('- a');
    expect(next).toContain('- b');
    expect(next).not.toContain('slug:');
  });
});
