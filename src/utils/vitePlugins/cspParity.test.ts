import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEV_CSP } from "./cspDevPlugin";

type CspDirectives = Map<string, Set<string>>;

function parseCsp(csp: string): CspDirectives {
  const directives: CspDirectives = new Map();
  for (const segment of csp.split(";")) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    directives.set(name.toLowerCase(), new Set(sources));
  }
  return directives;
}

interface TauriSecurityConfig {
  csp?: string;
  dangerousDisableAssetCspModification?: boolean | string[];
}

function readSecurityConfig(): TauriSecurityConfig {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
  ) as { app?: { security?: TauriSecurityConfig } };
  const security = config.app?.security;
  if (!security) {
    throw new Error("Security config not found in tauri.conf.json");
  }
  return security;
}

function readReleaseCsp(): string {
  const csp = readSecurityConfig().csp;
  if (!csp) {
    throw new Error("Release CSP not found in tauri.conf.json");
  }
  return csp;
}

// Sources the dev server legitimately adds for HMR; they are not expected in release.
const DEV_ONLY_SOURCES: Record<string, Set<string>> = {
  "connect-src": new Set(["ws:"]),
  "script-src": new Set(["'unsafe-inline'"]),
};

describe("CSP dev/release parity", () => {
  const releaseCsp = parseCsp(readReleaseCsp());
  const devCsp = parseCsp(DEV_CSP);

  it("allows https iframes so external video embeds load in both environments", () => {
    expect(releaseCsp.get("frame-src")?.has("https:")).toBe(true);
    expect(devCsp.get("frame-src")?.has("https:")).toBe(true);
  });

  it("keeps the same set of directives in dev and release", () => {
    expect([...devCsp.keys()].sort()).toEqual([...releaseCsp.keys()].sort());
  });

  it("keeps the dev CSP a superset of release, differing only by documented HMR sources", () => {
    for (const [directive, releaseSources] of releaseCsp) {
      const devSources = devCsp.get(directive);
      expect(
        devSources,
        `dev CSP missing directive ${directive}`,
      ).toBeDefined();

      for (const source of releaseSources) {
        expect(
          devSources?.has(source),
          `dev CSP ${directive} missing release source ${source}`,
        ).toBe(true);
      }

      const allowedExtras = DEV_ONLY_SOURCES[directive] ?? new Set<string>();
      for (const source of devSources ?? []) {
        if (releaseSources.has(source)) continue;
        expect(
          allowedExtras.has(source),
          `dev CSP ${directive} has unexpected extra source ${source}`,
        ).toBe(true);
      }
    }
  });

  // Tauri 打包时默认向 CSP 注入 nonce/hash；style-src 一旦带上 nonce，
  // 'unsafe-inline' 按规范被忽略，Shiki 的 inline token 颜色和 Mermaid 运行时
  // 注入的 <style> 都会在 release 中被静默拦截（dev header 无法复现该行为）。
  // 必须仅对 style-src 关闭注入，同时保留 script-src 的 hash 注入
  // （index.html 的 inline boot script 依赖它）。
  it("disables Tauri nonce injection for style-src only, keeping script hardening", () => {
    const disabled = readSecurityConfig().dangerousDisableAssetCspModification;
    expect(disabled).toEqual(["style-src"]);
  });

  it("keeps 'unsafe-inline' in release style-src for Shiki and Mermaid runtime styles", () => {
    expect(releaseCsp.get("style-src")?.has("'unsafe-inline'")).toBe(true);
  });
});
