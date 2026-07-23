/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from "vitest";
import {
  clearLivePreviewWikiCaches,
  invalidateLivePreviewWikiCachesForPath,
  livePreviewWikiCacheStatsForTest,
  seedLivePreviewWikiCachesForTest,
} from "./wiki";

describe("live preview wiki caches", () => {
  afterEach(() => {
    clearLivePreviewWikiCaches();
  });

  it("invalidates note entries for a target path and clears image failures", () => {
    seedLivePreviewWikiCachesForTest({
      noteKey: "note::src.md::vault/notes/Hello.md::Hello",
      imageKey: "wiki::src.md::![[Keep.png]]",
      failedKey: "wiki::src.md::![[missing.png]]",
    });
    seedLivePreviewWikiCachesForTest({
      noteKey: "note::src.md::vault/other/Keep.md::Keep",
    });

    invalidateLivePreviewWikiCachesForPath("vault/notes/Hello.md");

    const stats = livePreviewWikiCacheStatsForTest();
    expect(stats.notes).toBe(1);
    expect(stats.images).toBe(1);
    expect(stats.failed).toBe(0);
  });
});
