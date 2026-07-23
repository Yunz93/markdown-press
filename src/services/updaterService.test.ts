import { describe, expect, it } from "vitest";
import {
  areUpdaterArtifactsEnabled,
  checkForAppUpdate,
} from "./updaterService";
import { UPDATER_ARTIFACTS_ENABLED } from "./updaterCapabilities";

describe("updaterService artifacts gate", () => {
  it("exposes the shared artifacts flag", () => {
    expect(areUpdaterArtifactsEnabled()).toBe(UPDATER_ARTIFACTS_ENABLED);
  });

  it("skips network check while artifacts are disabled", async () => {
    if (UPDATER_ARTIFACTS_ENABLED) {
      // When artifacts are re-enabled, this guard is intentionally inactive.
      expect(UPDATER_ARTIFACTS_ENABLED).toBe(true);
      return;
    }
    await expect(checkForAppUpdate()).resolves.toBeNull();
  });
});
