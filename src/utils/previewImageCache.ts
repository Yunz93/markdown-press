import { isTauriEnvironment } from '../types/filesystem';

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

function decodeFileUrlPath(fileUrl: string): string {
  try {
    const url = new URL(fileUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return /^\/[a-zA-Z]:\//.test(decodedPath) ? decodedPath.slice(1) : decodedPath;
  } catch {
    return fileUrl.replace(/^file:\/\//i, '');
  }
}

function normalizeRemoteImageUrl(value: string): string {
  if (value.startsWith('//') && typeof window !== 'undefined') {
    return `${window.location.protocol}${value}`;
  }
  return value;
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

async function resolveImageSource(src: string, sourceFilePath?: string): Promise<string> {
  const trimmedSrc = src.trim();
  if (!trimmedSrc || trimmedSrc.startsWith('data:') || trimmedSrc.startsWith('blob:')) {
    return trimmedSrc;
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
    const resolvedSrc = await resolveImageSource(src, sourceFilePath);
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
