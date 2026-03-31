import { isTauriEnvironment } from '../../types/filesystem';

export function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value);
}

export function isAbsoluteFilePath(value: string): boolean {
  return /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(value);
}

export function decodeFileUrlPath(fileUrl: string): string {
  try {
    const url = new URL(fileUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return /^\/[a-zA-Z]:\//.test(decodedPath) ? decodedPath.slice(1) : decodedPath;
  } catch {
    return fileUrl.replace(/^file:\/\//i, '');
  }
}

export function isRemoteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function normalizeRemoteImageUrl(value: string): string {
  if (value.startsWith('//') && typeof window !== 'undefined') {
    return `${window.location.protocol}${value}`;
  }
  return value;
}

export function decodeLocalImageSource(value: string): string {
  if (!value || hasUrlScheme(value) || value.startsWith('//')) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

async function inlineFetchedImage(src: string): Promise<string> {
  const normalizedSrc = normalizeRemoteImageUrl(src);
  const response = await fetch(normalizedSrc, {
    mode: 'cors',
    credentials: 'omit',
    cache: 'force-cache',
    referrerPolicy: 'no-referrer',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return blobToDataUrl(await response.blob());
}

export async function resolveImageSource(src: string, sourceFilePath?: string): Promise<string> {
  const trimmedSrc = decodeLocalImageSource(src.trim());
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

  return trimmedSrc;
}

export async function prepareExportImages(container: HTMLElement, sourceFilePath?: string): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(images.map(async (image) => {
    const rawSrc = image.getAttribute('src');
    if (!rawSrc) return;

    const resolvedSrc = await resolveImageSource(rawSrc, sourceFilePath);
    if (!resolvedSrc) return;

    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';

    let exportSrc = resolvedSrc;
    try {
      exportSrc = await inlineFetchedImage(resolvedSrc);
    } catch (error) {
      if (isRemoteHttpUrl(resolvedSrc)) {
        console.warn('Failed to inline remote image for HTML export:', resolvedSrc, error);
      } else {
        console.warn('Failed to inline local image for HTML export:', resolvedSrc, error);
      }
    }

    if (exportSrc !== rawSrc) {
      image.setAttribute('src', exportSrc);
      image.src = exportSrc;
    }
  }));
}

export async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  const pendingImages = images.filter((image) => !image.complete);

  if (pendingImages.length === 0) {
    return;
  }

  await Promise.all(
    pendingImages.map((image) => new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    }))
  );
}

export async function waitForNextPaint(frames = 2): Promise<void> {
  for (let index = 0; index < frames; index += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

export function isImageAttachmentName(fileName: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(fileName);
}
