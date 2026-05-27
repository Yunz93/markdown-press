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

import { getFileSystem } from "../../types/filesystem";
import {
  inlineExportImageSource,
  prepareExportImages,
  resolveLocalImageAbsolutePath,
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

    await prepareExportImages(host, "/vault/notes/a.md");

    const img = host.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/^data:/);
    expect(img.getAttribute("crossorigin")).toBeNull();
  });
});
