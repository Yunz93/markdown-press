import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type TauriWindowConfig = {
  label?: string;
  title?: string;
  devtools?: boolean;
  [key: string]: unknown;
};

type TauriConfig = {
  productName?: string;
  app?: {
    windows?: TauriWindowConfig[];
    security?: Record<string, unknown>;
  };
  build?: Record<string, unknown>;
  bundle?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
};

type TauriCapabilityConfig = {
  windows?: string[];
};

const ALLOWED_DEV_OVERRIDE_PATHS = new Set([
  "app.windows.main.label",
  "app.windows.main.devtools",
]);

function readTauriConfig(path: string): TauriConfig {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ) as TauriConfig;
}

function readTauriCapabilityConfig(path: string): TauriCapabilityConfig {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), "utf8"),
  ) as TauriCapabilityConfig;
}

function getMainWindow(config: TauriConfig): TauriWindowConfig | undefined {
  return config.app?.windows?.find(
    (windowConfig) => windowConfig.label === "main",
  );
}

function getMainWindowTitle(config: TauriConfig): string | undefined {
  return getMainWindow(config)?.title;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeTauriConfigs(
  base: TauriConfig,
  overlay: TauriConfig,
): TauriConfig {
  const merged = structuredClone(base);

  function mergeValue(
    baseValue: unknown,
    overlayValue: unknown,
    path: string,
  ): unknown {
    if (Array.isArray(overlayValue)) {
      if (
        path.endsWith(".windows") &&
        overlayValue.every(
          (item) => isPlainObject(item) && typeof item.label === "string",
        )
      ) {
        const baseArray = Array.isArray(baseValue) ? [...baseValue] : [];
        for (const overlayItem of overlayValue as TauriWindowConfig[]) {
          const index = baseArray.findIndex(
            (item) => isPlainObject(item) && item.label === overlayItem.label,
          );
          if (index >= 0) {
            baseArray[index] = mergeValue(
              baseArray[index],
              overlayItem,
              `${path}.${overlayItem.label}`,
            ) as TauriWindowConfig;
          } else {
            baseArray.push(structuredClone(overlayItem));
          }
        }
        return baseArray;
      }

      return structuredClone(overlayValue);
    }

    if (isPlainObject(overlayValue)) {
      const nextBase = isPlainObject(baseValue) ? { ...baseValue } : {};
      for (const [key, value] of Object.entries(overlayValue)) {
        nextBase[key] = mergeValue(
          isPlainObject(baseValue) ? baseValue[key] : undefined,
          value,
          path ? `${path}.${key}` : key,
        );
      }
      return nextBase;
    }

    return overlayValue;
  }

  for (const [key, value] of Object.entries(overlay)) {
    if (key === "$schema") {
      continue;
    }
    (merged as Record<string, unknown>)[key] = mergeValue(
      (merged as Record<string, unknown>)[key],
      value,
      key,
    );
  }

  return merged;
}

function collectLeafConfigPaths(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    if (path.endsWith(".windows")) {
      return value.flatMap((item) => {
        if (!isPlainObject(item) || typeof item.label !== "string") {
          return collectLeafConfigPaths(item, path);
        }
        return collectLeafConfigPaths(item, `${path}.${item.label}`);
      });
    }

    return value.flatMap((item, index) =>
      collectLeafConfigPaths(item, `${path}[${index}]`),
    );
  }

  if (isPlainObject(value)) {
    const nestedPaths = Object.entries(value).flatMap(([key, nestedValue]) => {
      const nextPath = path ? `${path}.${key}` : key;
      return collectLeafConfigPaths(nestedValue, nextPath);
    });
    return nestedPaths.length > 0 ? nestedPaths : path ? [path] : [];
  }

  return path ? [path] : [];
}

function diffConfigPaths(left: unknown, right: unknown, path = ""): string[] {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (path.endsWith(".windows")) {
      const leftByLabel = new Map(
        left
          .filter(
            (item): item is TauriWindowConfig =>
              isPlainObject(item) && typeof item.label === "string",
          )
          .map((item) => [item.label as string, item]),
      );
      const rightByLabel = new Map(
        right
          .filter(
            (item): item is TauriWindowConfig =>
              isPlainObject(item) && typeof item.label === "string",
          )
          .map((item) => [item.label as string, item]),
      );

      const labels = new Set([...leftByLabel.keys(), ...rightByLabel.keys()]);
      return [...labels].flatMap((label) =>
        diffConfigPaths(
          leftByLabel.get(label),
          rightByLabel.get(label),
          `${path}.${label}`,
        ),
      );
    }

    return JSON.stringify(left) === JSON.stringify(right) ? [] : [path];
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) => {
      const nextPath = path ? `${path}.${key}` : key;
      return diffConfigPaths(left[key], right[key], nextPath);
    });
  }

  return JSON.stringify(left) === JSON.stringify(right) ? [] : [path];
}

describe("Tauri window config", () => {
  it("keeps the release main window discoverable by macOS window listing", () => {
    const config = readTauriConfig("src-tauri/tauri.conf.json");

    expect(getMainWindowTitle(config)).toBe(config.productName);
  });

  it("keeps the dev main window discoverable by macOS window listing", () => {
    const releaseConfig = readTauriConfig("src-tauri/tauri.conf.json");
    const devOverlay = readTauriConfig("src-tauri/tauri.dev.conf.json");
    const mergedDevConfig = mergeTauriConfigs(releaseConfig, devOverlay);

    expect(getMainWindowTitle(mergedDevConfig)).toBe(releaseConfig.productName);
  });

  it("limits tauri.dev.conf.json to debug-only overrides", () => {
    const devOverlay = readTauriConfig("src-tauri/tauri.dev.conf.json");
    const devPaths = collectLeafConfigPaths(devOverlay).filter(
      (path) => path !== "$schema",
    );

    expect(devPaths.length).toBeGreaterThan(0);
    expect(devPaths.every((path) => ALLOWED_DEV_OVERRIDE_PATHS.has(path))).toBe(
      true,
    );
  });

  it("keeps merged dev config aligned with release except for devtools", () => {
    const releaseConfig = readTauriConfig("src-tauri/tauri.conf.json");
    const devOverlay = readTauriConfig("src-tauri/tauri.dev.conf.json");
    const mergedDevConfig = mergeTauriConfigs(releaseConfig, devOverlay);

    const diffs = diffConfigPaths(releaseConfig, mergedDevConfig).filter(
      Boolean,
    );
    expect(diffs).toEqual(["app.windows.main.devtools"]);
    expect(getMainWindow(releaseConfig)?.devtools).toBe(false);
    expect(getMainWindow(mergedDevConfig)?.devtools).toBe(true);
  });

  it("grants the default desktop permissions to file document windows", () => {
    const capability = readTauriCapabilityConfig(
      "src-tauri/capabilities/default.json",
    );

    expect(capability.windows).toContain("main");
    expect(capability.windows).toContain("file-*");
  });
});
