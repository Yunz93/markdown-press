import { getFileSystem, isTauriEnvironment } from "../../types/filesystem";

export function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/i.test(value);
}

export function isAbsoluteFilePath(value: string): boolean {
  return /^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(value);
}

function isBrowserVirtualPath(value: string): boolean {
  return (
    /^browser(?:-dir)?-\d+(?:\/|$)/.test(value) || /^browser-\d+-/.test(value)
  );
}

export function decodeFileUrlPath(fileUrl: string): string {
  try {
    const url = new URL(fileUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return /^\/[a-zA-Z]:\//.test(decodedPath)
      ? decodedPath.slice(1)
      : decodedPath;
  } catch {
    return fileUrl.replace(/^file:\/\//i, "");
  }
}

export function isRemoteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function normalizeRemoteImageUrl(value: string): string {
  if (value.startsWith("//") && typeof window !== "undefined") {
    return `${window.location.protocol}${value}`;
  }
  return value;
}

export function decodeLocalImageSource(value: string): string {
  if (!value || hasUrlScheme(value) || value.startsWith("//")) {
    return value;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function guessImageMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    case "gif":
      return "image/gif";
    case "ico":
      return "image/x-icon";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

async function inlineFetchedImage(src: string): Promise<string> {
  if (src.startsWith("data:")) {
    return src;
  }

  const normalizedSrc = normalizeRemoteImageUrl(src);
  const response = await fetch(normalizedSrc, {
    mode: isRemoteHttpUrl(normalizedSrc) ? "cors" : "same-origin",
    credentials: "omit",
    cache: "force-cache",
    referrerPolicy: "no-referrer",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return blobToDataUrl(await response.blob());
}

async function inlineLocalImageFile(absolutePath: string): Promise<string> {
  const fs = await getFileSystem();

  if (typeof fs.readBinaryFile === "function") {
    const bytes = await fs.readBinaryFile(absolutePath);
    return blobToDataUrl(
      new Blob([bytes], { type: guessImageMimeType(absolutePath) }),
    );
  }

  if (typeof fs.getFileObjectUrl === "function") {
    const objectUrl = await fs.getFileObjectUrl(absolutePath);
    const response = await fetch(objectUrl, {
      mode: "same-origin",
      credentials: "omit",
      cache: "force-cache",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch local image object URL: ${response.status}`,
      );
    }
    return blobToDataUrl(await response.blob());
  }

  throw new Error(`Cannot read local image: ${absolutePath}`);
}

export async function resolveLocalImageAbsolutePath(
  src: string,
  sourceFilePath?: string,
): Promise<string | null> {
  const trimmedSrc = decodeLocalImageSource(src.trim());
  if (
    !trimmedSrc ||
    trimmedSrc.startsWith("data:") ||
    trimmedSrc.startsWith("blob:")
  ) {
    return null;
  }

  if (isRemoteHttpUrl(trimmedSrc) || trimmedSrc.startsWith("//")) {
    return null;
  }

  if (trimmedSrc.startsWith("asset:") || trimmedSrc.startsWith("tauri:")) {
    return null;
  }

  if (trimmedSrc.startsWith("file://")) {
    return decodeFileUrlPath(trimmedSrc);
  }

  if (isAbsoluteFilePath(trimmedSrc) || isBrowserVirtualPath(trimmedSrc)) {
    return trimmedSrc;
  }

  if (!sourceFilePath || hasUrlScheme(trimmedSrc)) {
    return null;
  }

  if (isTauriEnvironment()) {
    const { dirname, join, normalize } = await import("@tauri-apps/api/path");
    return normalize(await join(await dirname(sourceFilePath), trimmedSrc));
  }

  const baseDir = sourceFilePath.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
  return `${baseDir}/${trimmedSrc.replace(/\\/g, "/")}`.replace(/\/+/g, "/");
}

export async function resolveImageSource(
  src: string,
  sourceFilePath?: string,
): Promise<string> {
  const trimmedSrc = decodeLocalImageSource(src.trim());
  if (
    !trimmedSrc ||
    trimmedSrc.startsWith("data:") ||
    trimmedSrc.startsWith("blob:")
  ) {
    return trimmedSrc;
  }

  if (isTauriEnvironment()) {
    if (trimmedSrc.startsWith("asset:") || trimmedSrc.startsWith("tauri:")) {
      return trimmedSrc;
    }

    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const { dirname, join, normalize } = await import("@tauri-apps/api/path");

    let absolutePath = "";
    if (trimmedSrc.startsWith("file://")) {
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

  if (
    !hasUrlScheme(trimmedSrc) &&
    sourceFilePath &&
    typeof window !== "undefined"
  ) {
    try {
      return new URL(trimmedSrc, window.location.href).toString();
    } catch {
      return trimmedSrc;
    }
  }

  return trimmedSrc;
}

export async function inlineExportImageSource(
  rawSrc: string,
  sourceFilePath?: string,
): Promise<string> {
  const localPath = await resolveLocalImageAbsolutePath(rawSrc, sourceFilePath);
  if (localPath) {
    return inlineLocalImageFile(localPath);
  }

  const resolvedSrc = await resolveImageSource(rawSrc, sourceFilePath);
  if (!resolvedSrc) {
    return rawSrc;
  }

  return inlineFetchedImage(resolvedSrc);
}

export async function prepareExportImages(
  container: HTMLElement,
  sourceFilePath?: string,
): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(async (image) => {
      const rawSrc = image.getAttribute("src");
      if (!rawSrc) return;

      const inlineCandidate =
        image.getAttribute("data-original-src")?.trim() || rawSrc;

      let exportSrc = rawSrc;
      try {
        exportSrc = await inlineExportImageSource(
          inlineCandidate,
          sourceFilePath,
        );
      } catch (error) {
        const resolvedSrc = await resolveImageSource(
          inlineCandidate,
          sourceFilePath,
        );
        if (isRemoteHttpUrl(resolvedSrc)) {
          console.warn(
            "Failed to inline remote image for HTML export:",
            resolvedSrc,
            error,
          );
        } else {
          console.warn(
            "Failed to inline local image for HTML export:",
            resolvedSrc,
            error,
          );
        }
      }

      if (isRemoteHttpUrl(exportSrc)) {
        image.crossOrigin = "anonymous";
        image.referrerPolicy = "no-referrer";
      } else {
        image.removeAttribute("crossorigin");
        image.removeAttribute("referrerpolicy");
      }

      if (exportSrc !== rawSrc) {
        image.setAttribute("src", exportSrc);
        image.src = exportSrc;
      }
    }),
  );
}

export async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  const pendingImages = images.filter((image) => !image.complete);

  if (pendingImages.length === 0) {
    return;
  }

  await Promise.all(
    pendingImages.map(
      (image) =>
        new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
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
