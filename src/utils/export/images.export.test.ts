/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readBinaryFile = vi.fn(async () => new Uint8Array([137, 80, 78, 71]));

vi.mock("../../types/filesystem", () => ({
  isTauriEnvironment: vi.fn(() => true),
  getFileSystem: vi.fn(async () => ({
    readBinaryFile,
  })),
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn(async (path: string) => `asset://${path}`),
}));

vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(async () => "/vault/notes"),
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
  normalize: vi.fn(async (path: string) => path),
}));

vi.mock("../attachmentResolver", () => ({
  createAttachmentResolverContext: vi.fn(
    (files, rootFolderPath, currentFilePath) => ({
      files,
      rootFolderPath,
      currentFilePath,
    }),
  ),
  resolveAttachmentTarget: vi.fn(async (_context, target: string) => {
    if (target === "resources/poster.png") {
      return { path: "/vault/resources/poster.png", name: "poster.png" };
    }
    return null;
  }),
}));

import { getFileSystem } from "../../types/filesystem";
import * as attachmentResolver from "../attachmentResolver";
import {
  inlineExportImageSource,
  prepareExportImages,
  resolveExportImageLocalPath,
  resolveLocalImageAbsolutePath,
  waitForImages,
} from "./images";

describe("resolveLocalImageAbsolutePath", () => {
  it("resolves relative image paths against the current note", async () => {
    await expect(
      resolveLocalImageAbsolutePath("img/poster.png", "/vault/notes/a.md"),
    ).resolves.toBe("/vault/notes/img/poster.png");
  });

  it("returns absolute attachment paths unchanged", async () => {
    await expect(
      resolveLocalImageAbsolutePath(
        "/vault/resources/poster.jpg",
        "/vault/notes/a.md",
      ),
    ).resolves.toBe("/vault/resources/poster.jpg");
  });
});

describe("resolveExportImageLocalPath", () => {
  const attachmentContext = {
    files: [],
    rootFolderPath: "/vault",
  };

  it("resolves vault resource paths through attachmentResolver like preview", async () => {
    await expect(
      resolveExportImageLocalPath(
        "resources/poster.png",
        "/vault/notes/a.md",
        attachmentContext,
      ),
    ).resolves.toBe("/vault/resources/poster.png");
    expect(attachmentResolver.resolveAttachmentTarget).toHaveBeenCalled();
  });

  it("falls back to note-relative paths when attachmentResolver misses", async () => {
    await expect(
      resolveExportImageLocalPath(
        "img/local.png",
        "/vault/notes/a.md",
        attachmentContext,
      ),
    ).resolves.toBe("/vault/notes/img/local.png");
  });
});

describe("inlineExportImageSource", () => {
  beforeEach(() => {
    readBinaryFile.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
    vi.mocked(getFileSystem).mockResolvedValue({ readBinaryFile } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads local attachment files into data URLs instead of fetch(asset://)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const dataUrl = await inlineExportImageSource(
      "/vault/resources/poster.jpg",
      "/vault/notes/a.md",
    );

    expect(dataUrl.startsWith("data:")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("uses same-origin fetch for non-http resolved sources when local read is unavailable", async () => {
    vi.mocked(getFileSystem).mockResolvedValue({
      getFileObjectUrl: vi.fn(async () => "blob:local-image"),
    } as never);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["png"], { type: "image/png" }),
    } as Response);

    const dataUrl = await inlineExportImageSource(
      "img/poster.png",
      "/vault/notes/a.md",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "blob:local-image",
      expect.objectContaining({ mode: "same-origin" }),
    );
    expect(dataUrl.startsWith("data:")).toBe(true);

    fetchSpy.mockRestore();
  });
});

describe("prepareExportImages", () => {
  beforeEach(() => {
    readBinaryFile.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
    vi.mocked(getFileSystem).mockResolvedValue({ readBinaryFile } as never);
  });

  it("prefers data-original-src for wiki attachment embeds", async () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <img
        class="preview-attachment-image"
        src="/vault/resources/poster.jpg"
        data-original-src="/vault/resources/poster.jpg"
        alt="poster.jpg"
      />
    `;

    await prepareExportImages(host, "/vault/notes/a.md", {
      files: [],
      rootFolderPath: "/vault",
    });

    const img = host.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/^data:/);
    expect(img.getAttribute("crossorigin")).toBeNull();
  });

  it("inlines markdown images resolved via attachmentContext", async () => {
    const host = document.createElement("div");
    host.innerHTML = `<img src="resources/poster.png" alt="poster" />`;

    await prepareExportImages(host, "/vault/notes/a.md", {
      files: [],
      rootFolderPath: "/vault",
    });

    const img = host.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/^data:/);
    expect(readBinaryFile).toHaveBeenCalledWith("/vault/resources/poster.png");
  });
});

describe("waitForImages", () => {
  it("times out instead of waiting forever for images that never load", async () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    host.innerHTML = '<img src="https://example.invalid/missing.png" />';
    document.body.appendChild(host);

    const pending = waitForImages(host, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeUndefined();

    vi.useRealTimers();
    host.remove();
  });
});
