import { getFileSystem, isTauriEnvironment } from '../types/filesystem';

const resolvedPreviewImageCache = new Map<string, string>();
const previewImageLoadCache = new Map<string, Promise<string>>();
const blobUrlCache = new Map<string, Promise<string>>();
const createdBlobUrls = new Set<string>();

let unloadCleanupRegistered = false;

function getCacheKey(src: string, sourceFilePath?: string): string {
  return `${sourceFilePath ?? ''}::${src}`;
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value);
}

function isAbsoluteFilePath(value: string): boolean {
  return /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(value);
}

function isBrowserVirtualPath(value: string): boolean {
  return /^browser(?:-dir)?-\d+(?:\/|$)/.test(value) || /^browser-\d+-/.test(value);
}

function decodeFileUrlPath(fileUrl: string): string {
  try {
    const url = new URL(fileUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return /^\/[a-zA-Z]:\//.test(decodedPath) ? decodedPath.slice(1) : decodedPath;
  } catch {
    return fileUrl.replace(/^file:\/\//i, '');
  }
}

function encodeUrlPathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function normalizeGitHubImageUrl(value: string): string {
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

function normalizeRemoteImageUrl(value: string): string {
  const normalizedValue = value.startsWith('//') && typeof window !== 'undefined'
    ? `${window.location.protocol}${value}`
    : value;

  if (/^https?:\/\//i.test(normalizedValue)) {
    return normalizeGitHubImageUrl(normalizedValue);
  }

  return normalizedValue;
}

function splitPathRoot(path: string): { root: string; segments: string[] } {
  const normalized = path.replace(/\\/g, '/');

  if (isBrowserVirtualPath(normalized)) {
    const [root, ...rest] = normalized.split('/');
    return { root, segments: rest };
  }

  const windowsMatch = normalized.match(/^([a-zA-Z]:)(?:\/(.*))?$/);
  if (windowsMatch) {
    return {
      root: windowsMatch[1],
      segments: (windowsMatch[2] ?? '').split('/').filter(Boolean),
    };
  }

  if (normalized.startsWith('/')) {
    return {
      root: '/',
      segments: normalized.slice(1).split('/').filter(Boolean),
    };
  }

  return {
    root: '',
    segments: normalized.split('/').filter(Boolean),
  };
}

function joinNormalizedPath(root: string, segments: string[]): string {
  if (root === '/') {
    return `/${segments.join('/')}`;
  }

  if (!root) {
    return segments.join('/');
  }

  return segments.length > 0 ? `${root}/${segments.join('/')}` : root;
}

function resolveRelativeLocalPath(sourceFilePath: string, targetPath: string): string {
  const source = splitPathRoot(sourceFilePath);
  const target = targetPath.replace(/\\/g, '/');
  const isAbsoluteTarget = target.startsWith('/') || /^[a-zA-Z]:\//.test(target) || isBrowserVirtualPath(target);
  const baseSegments = isAbsoluteTarget ? [] : source.segments.slice(0, -1);
  const { root: targetRoot, segments: targetSegments } = splitPathRoot(target);
  const root = targetRoot || source.root;
  const segments = isAbsoluteTarget ? [] : baseSegments;

  for (const segment of targetSegments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length > 0) {
        segments.pop();
      }
      continue;
    }
    segments.push(segment);
  }

  return joinNormalizedPath(root, segments);
}

function registerUnloadCleanup() {
  if (unloadCleanupRegistered || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('beforeunload', () => {
    createdBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    createdBlobUrls.clear();
  }, { once: true });

  unloadCleanupRegistered = true;
}

export async function resolvePreviewSource(src: string, sourceFilePath?: string): Promise<string> {
  const trimmedSrc = src.trim();
  if (!trimmedSrc || trimmedSrc.startsWith('data:') || trimmedSrc.startsWith('blob:')) {
    return trimmedSrc;
  }

  const localSourceCandidate = trimmedSrc.startsWith('file://')
    ? decodeFileUrlPath(trimmedSrc)
    : (
      isAbsoluteFilePath(trimmedSrc)
      || isBrowserVirtualPath(trimmedSrc)
      || (!hasUrlScheme(trimmedSrc) && sourceFilePath)
        ? (sourceFilePath && !hasUrlScheme(trimmedSrc) && !isAbsoluteFilePath(trimmedSrc) && !isBrowserVirtualPath(trimmedSrc)
          ? resolveRelativeLocalPath(sourceFilePath, trimmedSrc)
          : trimmedSrc)
        : ''
    );

  if (localSourceCandidate) {
    try {
      const fs = await getFileSystem();
      if (typeof fs.getFileObjectUrl === 'function') {
        return await fs.getFileObjectUrl(localSourceCandidate);
      }
    } catch {
      // Fall through to environment-specific URL resolution.
    }
  }

  if (isTauriEnvironment()) {
    if (trimmedSrc.startsWith('asset:') || trimmedSrc.startsWith('tauri:')) {
      return trimmedSrc;
    }

    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const { dirname, join, normalize } = await import('@tauri-apps/api/path');

    let absolutePath = '';
    if (trimmedSrc.startsWith('file://')) {
      absolutePath = decodeFileUrlPath(trimmedSrc);
    } else if (isAbsoluteFilePath(trimmedSrc)) {
      absolutePath = trimmedSrc;
    } else if (sourceFilePath && !hasUrlScheme(trimmedSrc)) {
      absolutePath = await join(await dirname(sourceFilePath), trimmedSrc);
    } else {
      return trimmedSrc;
    }

    return convertFileSrc(await normalize(absolutePath));
  }

  if (!hasUrlScheme(trimmedSrc) && sourceFilePath && typeof window !== 'undefined') {
    try {
      return new URL(trimmedSrc, window.location.href).toString();
    } catch {
      return trimmedSrc;
    }
  }

  return normalizeRemoteImageUrl(trimmedSrc);
}

async function fetchBlobUrl(src: string): Promise<string> {
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }

  let cached = blobUrlCache.get(src);
  if (cached) {
    return cached;
  }

  cached = (async () => {
    registerUnloadCleanup();

    const response = await fetch(src, {
      cache: 'force-cache',
      credentials: 'omit',
      mode: /^https?:\/\//i.test(src) ? 'cors' : 'same-origin',
      referrerPolicy: 'no-referrer',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch preview image: ${response.status}`);
    }

    const blobUrl = URL.createObjectURL(await response.blob());
    createdBlobUrls.add(blobUrl);
    return blobUrl;
  })().catch((error) => {
    blobUrlCache.delete(src);
    throw error;
  });

  blobUrlCache.set(src, cached);
  return cached;
}

export function getCachedPreviewImageSrc(src: string, sourceFilePath?: string): string | null {
  return resolvedPreviewImageCache.get(getCacheKey(src, sourceFilePath)) ?? null;
}

export function hydrateCachedPreviewImageSources(html: string, sourceFilePath?: string): string {
  if (!html.includes('<img') || typeof DOMParser === 'undefined') {
    return html;
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  let hasChanges = false;

  parsed.querySelectorAll('img').forEach((image) => {
    const originalSrc = image.getAttribute('data-original-src') || image.getAttribute('src');
    if (!originalSrc) return;

    const cachedSrc = getCachedPreviewImageSrc(originalSrc, sourceFilePath);
    if (!cachedSrc || cachedSrc === image.getAttribute('src')) {
      return;
    }

    image.setAttribute('data-original-src', originalSrc);
    image.setAttribute('src', cachedSrc);
    hasChanges = true;
  });

  return hasChanges ? parsed.body.innerHTML : html;
}

export async function warmPreviewImage(src: string, sourceFilePath?: string): Promise<string> {
  const cacheKey = getCacheKey(src, sourceFilePath);
  const cached = resolvedPreviewImageCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let pending = previewImageLoadCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  pending = (async () => {
    const resolvedSrc = await resolvePreviewSource(src, sourceFilePath);

    if (!resolvedSrc) {
      return src;
    }

    try {
      const cachedSrc = await fetchBlobUrl(resolvedSrc);
      resolvedPreviewImageCache.set(cacheKey, cachedSrc);
      return cachedSrc;
    } catch {
      resolvedPreviewImageCache.set(cacheKey, resolvedSrc);
      return resolvedSrc;
    }
  })().finally(() => {
    previewImageLoadCache.delete(cacheKey);
  });

  previewImageLoadCache.set(cacheKey, pending);
  return pending;
}
