import { describe, expect, it } from 'vitest';
import type { AppSettings } from '../types';
import { replaceLocalImagesWithHostingForPublish } from './publishLocalImagesToHosting';

describe('replaceLocalImagesWithHostingForPublish', () => {
  it('normalizes remote GitHub image URLs without requiring image hosting', async () => {
    const result = await replaceLocalImagesWithHostingForPublish(
      `---
title: Test Post
---

![cover](<https://github.com/foo/bar/blob/main/images/cover.png> "cover title")
`,
      {
        files: [],
        currentFilePath: '/notes/test-post.md',
        settings: {
          imageHosting: {
            provider: 'none',
          },
        } as AppSettings,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.uploadedCount).toBe(0);
    expect(result.markdown).toContain(
      '![cover](<https://raw.githubusercontent.com/foo/bar/main/images/cover.png> "cover title")'
    );
  });
});
