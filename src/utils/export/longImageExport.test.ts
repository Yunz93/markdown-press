/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasToPngBlob } from "./longImageExport";

describe("canvasToPngBlob", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects when the browser never calls toBlob", async () => {
    vi.useFakeTimers();
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "toBlob", {
      configurable: true,
      value: vi.fn(),
    });

    const pending = expect(canvasToPngBlob(canvas, 1000)).rejects.toThrow(
      "Long image export timed out while encoding PNG",
    );
    await vi.advanceTimersByTimeAsync(1000);

    await pending;
  });

  it("rejects when toBlob returns an empty PNG blob", async () => {
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "toBlob", {
      configurable: true,
      value: vi.fn((callback: BlobCallback) => callback(null)),
    });

    await expect(canvasToPngBlob(canvas)).rejects.toThrow(
      "Long image export failed: empty PNG blob",
    );
  });
});
