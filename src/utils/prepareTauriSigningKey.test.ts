import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const scriptPath = resolve(
  projectRoot,
  "scripts/prepare-tauri-signing-key.mjs",
);

const SAMPLE_RAW_KEY = `untrusted comment: minisign secret key
RWRCSwAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

function runPrepare(input: string) {
  const workDir = mkdtempSync(join(tmpdir(), "prepare-signing-key-test-"));
  const githubEnvPath = join(workDir, "github.env");
  writeFileSync(githubEnvPath, "");

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY_INPUT: input,
      GITHUB_ENV: githubEnvPath,
    },
  });

  return { workDir, githubEnvPath, result };
}

describe("prepare-tauri-signing-key.mjs", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("re-encodes raw keys to clean CI base64", () => {
    const { workDir, githubEnvPath, result } = runPrepare(SAMPLE_RAW_KEY);
    tempDirs.push(workDir);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const githubEnv = readFileSync(githubEnvPath, "utf8");
    const match = githubEnv.match(
      /TAURI_SIGNING_PRIVATE_KEY<<EOF\n([^\n]+)\nEOF\n/,
    );
    const exported = match?.[1] ?? "";
    expect(exported).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(exported.includes("%")).toBe(false);

    const decoded = Buffer.from(exported, "base64").toString("utf8");
    expect(decoded).toContain("untrusted comment: minisign secret key");
    expect(decoded).toContain("RWRCSwAAAAD");
  });

  it("re-encodes already-base64 CI keys instead of passing dirt through", () => {
    const { workDir, githubEnvPath, result } = runPrepare(
      Buffer.from(`${SAMPLE_RAW_KEY}\n`, "utf8").toString("base64"),
    );
    tempDirs.push(workDir);

    expect(result.status).toBe(0);
    const githubEnv = readFileSync(githubEnvPath, "utf8");
    const match = githubEnv.match(
      /TAURI_SIGNING_PRIVATE_KEY<<EOF\n([^\n]+)\nEOF\n/,
    );
    const exported = match?.[1] ?? "";
    expect(exported).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(Buffer.from(exported, "base64").toString("utf8")).toContain(
      "untrusted comment: minisign secret key",
    );
  });

  it("URL-decodes percent-encoded base64 secrets before re-encoding", () => {
    const clean = Buffer.from(`${SAMPLE_RAW_KEY}\n`, "utf8").toString("base64");
    const dirty = clean.replace(/\+/g, "%2B").replace(/\//g, "%2F");

    const { workDir, githubEnvPath, result } = runPrepare(dirty);
    tempDirs.push(workDir);

    expect(result.status).toBe(0);
    const githubEnv = readFileSync(githubEnvPath, "utf8");
    const match = githubEnv.match(
      /TAURI_SIGNING_PRIVATE_KEY<<EOF\n([^\n]+)\nEOF\n/,
    );
    const exported = match?.[1] ?? "";
    expect(exported.includes("%")).toBe(false);
    expect(exported).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });
});
