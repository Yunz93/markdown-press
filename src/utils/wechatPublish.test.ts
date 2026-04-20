import { describe, expect, it } from 'vitest';
import { extractWechatDraftDefaults } from './wechatPublish';

describe('extractWechatDraftDefaults', () => {
  it('prefers frontmatter values when available', () => {
    const defaults = extractWechatDraftDefaults(`---
title: 自定义标题
author: 张三
digest: 自定义摘要
content_source_url: https://example.com/source
show_cover_pic: false
wechat_draft_media_id: MEDIA123
---

正文内容
`, '/tmp/post.md');

    expect(defaults).toEqual({
      title: '自定义标题',
      author: '张三',
      digest: '自定义摘要',
      contentSourceUrl: 'https://example.com/source',
      showCoverPic: false,
      existingDraftMediaId: 'MEDIA123',
    });
  });

  it('falls back to file name and body excerpt', () => {
    const defaults = extractWechatDraftDefaults(`

第一段正文会被用来生成摘要。这里还有一些补充内容，保证摘要不是空字符串。

第二段内容。
`, '/notes/my-article.md');

    expect(defaults.title).toBe('my-article');
    expect(defaults.author).toBe('');
    expect(defaults.digest).toContain('第一段正文会被用来生成摘要');
    expect(defaults.existingDraftMediaId).toBe('');
    expect(defaults.showCoverPic).toBe(true);
  });
});
