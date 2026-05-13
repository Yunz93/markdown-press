import { describe, it, expect } from 'vitest';
import {
  normalizeGitHubImageUrl,
  normalizeRemoteImageUrl,
} from './remoteImageUrl';

describe('normalizeGitHubImageUrl', () => {
  it('returns original value for non-GitHub URLs', () => {
    expect(normalizeGitHubImageUrl('https://example.com/image.png')).toBe(
      'https://example.com/image.png'
    );
  });

  it('returns original value for invalid URLs', () => {
    expect(normalizeGitHubImageUrl('not-a-url')).toBe('not-a-url');
  });

  it('returns original value for empty string', () => {
    expect(normalizeGitHubImageUrl('')).toBe('');
  });

  it('returns original value for github.com URL with too few segments', () => {
    expect(normalizeGitHubImageUrl('https://github.com/owner/repo')).toBe(
      'https://github.com/owner/repo'
    );
  });

  it('returns original value for github.com URL without raw or blob mode', () => {
    expect(
      normalizeGitHubImageUrl('https://github.com/owner/repo/tree/main/images/logo.png')
    ).toBe('https://github.com/owner/repo/tree/main/images/logo.png');
  });

  it('returns original value for github.com URL without branch', () => {
    expect(
      normalizeGitHubImageUrl('https://github.com/owner/repo/raw')
    ).toBe('https://github.com/owner/repo/raw');
  });

  it('returns original value for github.com URL without path segments', () => {
    expect(
      normalizeGitHubImageUrl('https://github.com/owner/repo/raw/main')
    ).toBe('https://github.com/owner/repo/raw/main');
  });

  it('converts blob URL to raw.githubusercontent.com', () => {
    expect(
      normalizeGitHubImageUrl(
        'https://github.com/owner/repo/blob/main/images/logo.png'
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/images/logo.png'
    );
  });

  it('converts raw URL to raw.githubusercontent.com', () => {
    expect(
      normalizeGitHubImageUrl(
        'https://github.com/owner/repo/raw/main/images/logo.png'
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/images/logo.png'
    );
  });

  it('encodes special characters in branch name', () => {
    expect(
      normalizeGitHubImageUrl(
        "https://github.com/owner/repo/blob/feat/test+1/images/logo.png"
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/feat/test%2B1/images/logo.png'
    );
  });

  it('encodes special characters in path segments', () => {
    expect(
      normalizeGitHubImageUrl(
        "https://github.com/owner/repo/blob/main/images/my(logo).png"
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/images/my%28logo%29.png'
    );
  });

  it('encodes exclamation mark in path', () => {
    expect(
      normalizeGitHubImageUrl(
        'https://github.com/owner/repo/blob/main/images/important!.png'
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/images/important%21.png'
    );
  });

  it('encodes apostrophe in path', () => {
    expect(
      normalizeGitHubImageUrl(
        "https://github.com/owner/repo/blob/main/images/user's.png"
      )
    ).toBe(
      "https://raw.githubusercontent.com/owner/repo/main/images/user%27s.png"
    );
  });

  it('encodes asterisk in path', () => {
    expect(
      normalizeGitHubImageUrl(
        'https://github.com/owner/repo/blob/main/images/star*.png'
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/images/star%2A.png'
    );
  });

  it('handles nested paths with multiple segments', () => {
    expect(
      normalizeGitHubImageUrl(
        'https://github.com/owner/repo/blob/main/a/b/c/d/image.png'
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/a/b/c/d/image.png'
    );
  });

  it('handles URL with port', () => {
    expect(
      normalizeGitHubImageUrl(
        'https://github.com:8443/owner/repo/blob/main/images/logo.png'
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/images/logo.png'
    );
  });

  it('preserves query string in non-GitHub URLs', () => {
    expect(
      normalizeGitHubImageUrl('https://example.com/image.png?v=123')
    ).toBe('https://example.com/image.png?v=123');
  });
});

describe('normalizeRemoteImageUrl', () => {
  it('returns non-HTTP URLs unchanged', () => {
    expect(normalizeRemoteImageUrl('/local/path.png')).toBe('/local/path.png');
    expect(normalizeRemoteImageUrl('file:///path.png')).toBe('file:///path.png');
  });

  it('returns HTTP URLs after GitHub normalization', () => {
    expect(
      normalizeRemoteImageUrl(
        'https://github.com/owner/repo/blob/main/images/logo.png'
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/images/logo.png'
    );
  });

  it('returns non-GitHub HTTP URLs unchanged', () => {
    expect(normalizeRemoteImageUrl('https://example.com/image.png')).toBe(
      'https://example.com/image.png'
    );
  });

  it('handles HTTPS URLs', () => {
    expect(normalizeRemoteImageUrl('https://example.com/image.png')).toBe(
      'https://example.com/image.png'
    );
  });

  it('prepends protocol to protocol-relative URLs when provided', () => {
    expect(normalizeRemoteImageUrl('//example.com/image.png', 'https:')).toBe(
      'https://example.com/image.png'
    );
  });

  it('prepends HTTP protocol to protocol-relative URLs', () => {
    expect(normalizeRemoteImageUrl('//example.com/image.png', 'http:')).toBe(
      'http://example.com/image.png'
    );
  });

  it('leaves protocol-relative URLs unchanged when no protocol provided', () => {
    expect(normalizeRemoteImageUrl('//example.com/image.png')).toBe(
      '//example.com/image.png'
    );
  });

  it('normalizes protocol-relative GitHub URLs with protocol', () => {
    expect(
      normalizeRemoteImageUrl(
        '//github.com/owner/repo/blob/main/images/logo.png',
        'https:'
      )
    ).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/images/logo.png'
    );
  });

  it('handles empty string', () => {
    expect(normalizeRemoteImageUrl('')).toBe('');
  });

  it('handles URL with uppercase HTTP protocol', () => {
    expect(normalizeRemoteImageUrl('HTTP://example.com/image.png')).toBe(
      'HTTP://example.com/image.png'
    );
  });

  it('handles URL with mixed case HTTPS protocol', () => {
    expect(normalizeRemoteImageUrl('HtTpS://example.com/image.png')).toBe(
      'HtTpS://example.com/image.png'
    );
  });
});
