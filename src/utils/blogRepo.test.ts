import { describe, it, expect } from 'vitest';
import { normalizeBlogRepoUrl, normalizeBlogSiteUrl } from './blogRepo';

describe('normalizeBlogRepoUrl', () => {
  it('normalizes HTTPS GitHub URL', () => {
    expect(normalizeBlogRepoUrl('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('strips .git suffix from HTTPS URL', () => {
    expect(normalizeBlogRepoUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
  });

  it('normalizes SSH GitHub URL', () => {
    expect(normalizeBlogRepoUrl('git@github.com:owner/repo.git')).toBe('git@github.com:owner/repo.git');
  });

  it('auto-prefixes bare owner/repo with https', () => {
    expect(normalizeBlogRepoUrl('owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('normalizes github.com/ prefix', () => {
    expect(normalizeBlogRepoUrl('github.com/owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('strips trailing slashes', () => {
    expect(normalizeBlogRepoUrl('https://github.com/owner/repo/')).toBe('https://github.com/owner/repo');
  });

  it('rejects local paths', () => {
    expect(normalizeBlogRepoUrl('/Users/test/code/repo')).toBe('');
  });

  it('rejects invalid repo formats', () => {
    expect(normalizeBlogRepoUrl('not-a-repo')).toBe('');
    expect(normalizeBlogRepoUrl('https://github.com/')).toBe('');
    expect(normalizeBlogRepoUrl('https://github.com/owner/repo/extra')).toBe('');
  });

  it('returns empty for empty input', () => {
    expect(normalizeBlogRepoUrl('')).toBe('');
    expect(normalizeBlogRepoUrl('  ')).toBe('');
  });
});

describe('normalizeBlogSiteUrl', () => {
  it('normalizes valid URL', () => {
    expect(normalizeBlogSiteUrl('https://blog.example.com')).toBe('https://blog.example.com');
  });

  it('auto-prefixes https', () => {
    expect(normalizeBlogSiteUrl('blog.example.com')).toBe('https://blog.example.com');
  });

  it('strips trailing slashes', () => {
    expect(normalizeBlogSiteUrl('https://blog.example.com/')).toBe('https://blog.example.com');
  });

  it('returns empty for empty input', () => {
    expect(normalizeBlogSiteUrl('')).toBe('');
    expect(normalizeBlogSiteUrl('  ')).toBe('');
  });
});
