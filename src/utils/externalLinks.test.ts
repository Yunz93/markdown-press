// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "./externalLinks";

const shellOpen = vi.fn(async (_url: string) => {});
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (url: string) => shellOpen(url),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  shellOpen.mockClear();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("openExternalUrl", () => {
  it("opens in a new browser tab when not running under Tauri (dev parity)", async () => {
    const windowOpen = vi.fn();
    vi.stubGlobal("open", windowOpen);

    await openExternalUrl("https://example.com/page");

    expect(windowOpen).toHaveBeenCalledWith(
      "https://example.com/page",
      "_blank",
      "noopener,noreferrer",
    );
    expect(shellOpen).not.toHaveBeenCalled();
  });

  it("delegates to the Tauri shell plugin when running under Tauri (release)", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const windowOpen = vi.fn();
    vi.stubGlobal("open", windowOpen);

    await openExternalUrl("https://example.com/page");

    expect(shellOpen).toHaveBeenCalledWith("https://example.com/page");
    expect(windowOpen).not.toHaveBeenCalled();
  });
});
