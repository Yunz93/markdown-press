function encodeUrlPathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function normalizeGitHubImageUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com') {
      return value;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 5) {
      return value;
    }

    const [owner, repo, mode, ...rest] = segments;
    if (!owner || !repo || (mode !== 'raw' && mode !== 'blob') || rest.length < 2) {
      return value;
    }

    const [branch, ...pathSegments] = rest;
    if (!branch || pathSegments.length === 0) {
      return value;
    }

    const encodedBranch = encodeUrlPathSegment(branch);
    const encodedPath = pathSegments.map(encodeUrlPathSegment).join('/');
    return `https://raw.githubusercontent.com/${owner}/${repo}/${encodedBranch}/${encodedPath}`;
  } catch {
    return value;
  }
}

export function normalizeRemoteImageUrl(value: string, protocol?: string): string {
  const normalizedValue = value.startsWith('//') && protocol
    ? `${protocol}${value}`
    : value;

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizeGitHubImageUrl(normalizedValue);
  }

  return normalizedValue;
}
