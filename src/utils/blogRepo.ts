const GITHUB_REPO_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

function isValidRepoSegment(value: string): boolean {
  return !!value && GITHUB_REPO_SEGMENT_RE.test(value);
}

function isValidGithubRepoPath(value: string): boolean {
  const parts = value.split('/');
  return parts.length === 2 && parts.every(isValidRepoSegment);
}

export function normalizeBlogRepoUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  if (trimmed.startsWith('https://github.com/')) {
    const repoPath = trimmed.slice('https://github.com/'.length).replace(/\.git$/, '');
    return isValidGithubRepoPath(repoPath) ? `https://github.com/${repoPath}` : '';
  }

  if (trimmed.startsWith('git@github.com:')) {
    const repoPath = trimmed.slice('git@github.com:'.length).replace(/\.git$/, '');
    return isValidGithubRepoPath(repoPath) ? `git@github.com:${repoPath}.git` : '';
  }

  if (trimmed.startsWith('github.com/')) {
    const repoPath = trimmed.slice('github.com/'.length).replace(/\.git$/, '');
    return isValidGithubRepoPath(repoPath) ? `https://github.com/${repoPath}` : '';
  }

  return isValidGithubRepoPath(trimmed) ? `https://github.com/${trimmed}` : '';
}

export function isValidBlogRepoUrl(raw: string): boolean {
  return normalizeBlogRepoUrl(raw).length > 0;
}

export function isValidOrEmptyBlogRepoUrl(raw: string): boolean {
  return !raw.trim() || isValidBlogRepoUrl(raw);
}

export function normalizeBlogSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }

    const normalizedPath = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${normalizedPath}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function isValidBlogSiteUrl(raw: string): boolean {
  return normalizeBlogSiteUrl(raw).length > 0;
}

export function isValidOrEmptyBlogSiteUrl(raw: string): boolean {
  return !raw.trim() || isValidBlogSiteUrl(raw);
}
