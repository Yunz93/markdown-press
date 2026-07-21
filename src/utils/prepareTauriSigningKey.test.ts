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

describe("prepare-tauri-signing-key.mjs", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exports CI base64 key contents through TAURI_SIGNING_PRIVATE_KEY", () => {
    const workDir = mkdtempSync(join(tmpdir(), "prepare-signing-key-test-"));
    tempDirs.push(workDir);

    const githubEnvPath = join(workDir, "github.env");
    writeFileSync(githubEnvPath, "");

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        TAURI_SIGNING_PRIVATE_KEY_INPUT: SAMPLE_RAW_KEY,
        GITHUB_ENV: githubEnvPath,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const githubEnv = readFileSync(githubEnvPath, "utf8");
    const match = githubEnv.match(
      /TAURI_SIGNING_PRIVATE_KEY<<EOF\n([^\n]+)\nEOF\n/,
    );
    expect(match?.[1]).toBeTruthy();

    const exported = match?.[1] ?? "";
    expect(exported.includes("updater.key")).toBe(false);
    expect(exported.includes("untrusted comment:")).toBe(false);

    const decoded = Buffer.from(exported, "base64").toString("utf8");
    expect(decoded).toContain("untrusted comment: minisign secret key");
    expect(decoded).toContain("RWRCSwAAAAD");
  });

  it("passes through an already-base64 CI key unchanged", () => {
    const workDir = mkdtempSync(join(tmpdir(), "prepare-signing-key-b64-"));
    tempDirs.push(workDir);

    const githubEnvPath = join(workDir, "github.env");
    writeFileSync(githubEnvPath, "");

    const ciKey = Buffer.from(`${SAMPLE_RAW_KEY}\n`, "utf8").toString("base64");
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        TAURI_SIGNING_PRIVATE_KEY_INPUT: ciKey,
        GITHUB_ENV: githubEnvPath,
      },
    });

    expect(result.status).toBe(0);
    const githubEnv = readFileSync(githubEnvPath, "utf8");
    const match = githubEnv.match(
      /TAURI_SIGNING_PRIVATE_KEY<<EOF\n([^\n]+)\nEOF\n/,
    );
    expect(match?.[1]).toBe(ciKey);
  });
});
