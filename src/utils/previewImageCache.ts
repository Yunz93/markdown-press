import { getFileSystem, isTauriEnvironment } from '../types/filesystem';
import { normalizeRemoteImageUrl } from './remoteImageUrl';

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

/**
 * Resolve a URL suitable for `<img src>` / media elements.
 *
 * In Tauri, prefer `convertFileSrc` (protocol URL) over reading the full file
 * into a Blob — materializing every image up front is the main cause of jank
 * in long, image-heavy preview documents. Browser virtual paths still need
 * object URLs because there is no asset protocol.
 */
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

  // Tauri: use the asset protocol instead of reading bytes into memory.
  if (isTauriEnvironment()) {
    if (trimmedSrc.startsWith('asset:') || trimmedSrc.startsWith('tauri:')) {
      return trimmedSrc;
    }

    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const { dirname, join, normalize } = await import('@tauri-apps/api/path');

    let absolutePath = '';
    if (localSourceCandidate && !isBrowserVirtualPath(localSourceCandidate)) {
      absolutePath = localSourceCandidate;
    } else if (trimmedSrc.startsWith('file://')) {
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

  if (!hasUrlScheme(trimmedSrc) && sourceFilePath && typeof window !== 'undefined') {
    try {
      return new URL(trimmedSrc, window.location.href).toString();
    } catch {
      return trimmedSrc;
    }
  }

  return normalizeRemoteImageUrl(
    trimmedSrc,
    typeof window !== 'undefined' ? window.location.protocol : undefined
  );
}

/** True when displaying the image requires reading file bytes (browser FS Access). */
export function previewSourceNeedsMaterialization(src: string): boolean {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return false;
  }
  if (hasUrlScheme(trimmed) && !trimmed.startsWith('file://')) {
    return false;
  }
  if (isTauriEnvironment()) {
    return false;
  }
  return true;
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

    // Already an in-memory object/data URL — cache and return without re-fetching.
    if (resolvedSrc.startsWith('blob:') || resolvedSrc.startsWith('data:')) {
      resolvedPreviewImageCache.set(cacheKey, resolvedSrc);
      return resolvedSrc;
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

export interface LazyPreviewImageWarmOptions {
  sourceFilePath?: string | null;
  /** IntersectionObserver root (usually the preview scroll container). */
  root?: Element | null;
  rootMargin?: string;
  concurrency?: number;
}

/**
 * Resolve / warm preview images only as they approach the viewport.
 * Used for browser local files that need object-URL materialization, and to
 * optionally upgrade display URLs into the blob cache without blocking first paint.
 */
export function mountLazyPreviewImageWarming(
  container: HTMLElement,
  options: LazyPreviewImageWarmOptions = {},
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    return () => {};
  }

  const sourceFilePath = options.sourceFilePath || undefined;
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const queue: HTMLImageElement[] = [];
  const queued = new WeakSet<HTMLImageElement>();
  let active = 0;
  let cancelled = false;

  const pump = () => {
    while (!cancelled && active < concurrency && queue.length > 0) {
      const image = queue.shift();
      if (!image || !image.isConnected) continue;

      active += 1;
      void (async () => {
        try {
          const originalSrc =
            image.getAttribute('data-original-src')?.trim()
            || image.getAttribute('data-preview-pending-src')?.trim();
          if (!originalSrc) return;

          const warmedSrc = await warmPreviewImage(originalSrc, sourceFilePath);
          if (cancelled || !image.isConnected) return;

          image.setAttribute('src', warmedSrc);
          image.setAttribute('data-original-src', originalSrc);
          image.setAttribute('data-preview-warmed', 'true');
          image.removeAttribute('data-preview-pending-src');
          image.setAttribute('decoding', 'async');
          image.setAttribute('loading', 'lazy');
          image.setAttribute('fetchpriority', 'auto');
        } catch (error) {
          console.warn('Failed to lazily warm preview image:', error);
          if (cancelled || !image.isConnected) return;

          const pendingSrc = image.getAttribute('data-preview-pending-src')?.trim();
          if (pendingSrc && !image.getAttribute('src')) {
            try {
              const fallbackSrc = await resolvePreviewSource(pendingSrc, sourceFilePath);
              if (!cancelled && image.isConnected) {
                image.setAttribute('src', fallbackSrc);
                image.setAttribute('data-preview-warmed', 'true');
                image.removeAttribute('data-preview-pending-src');
              }
            } catch {
              // Leave the placeholder; the image stays unloaded.
            }
          }
        } finally {
          active -= 1;
          pump();
        }
      })();
    }
  };

  const enqueue = (image: HTMLImageElement) => {
    if (cancelled || queued.has(image) || image.getAttribute('data-preview-warmed') === 'true') {
      return;
    }
    queued.add(image);
    queue.push(image);
    pump();
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const image = entry.target;
        if (!(image instanceof HTMLImageElement)) continue;
        observer.unobserve(image);
        enqueue(image);
      }
    },
    {
      root: options.root ?? null,
      rootMargin: options.rootMargin ?? '320px 0px',
      threshold: 0.01,
    },
  );

  const pendingImages = container.querySelectorAll<HTMLImageElement>(
    'img[data-preview-warmed="pending"], img[data-preview-pending-src]',
  );
  pendingImages.forEach((image) => observer.observe(image));

  return () => {
    cancelled = true;
    queue.length = 0;
    observer.disconnect();
  };
}
