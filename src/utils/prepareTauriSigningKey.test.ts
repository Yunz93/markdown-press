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

  it("exports the temp key file path through TAURI_SIGNING_PRIVATE_KEY", () => {
    const workDir = mkdtempSync(join(tmpdir(), "prepare-signing-key-test-"));
    tempDirs.push(workDir);

    const githubEnvPath = join(workDir, "github.env");
    const githubOutputPath = join(workDir, "github.output");
    writeFileSync(githubEnvPath, "");
    writeFileSync(githubOutputPath, "");

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        TAURI_SIGNING_PRIVATE_KEY_INPUT: SAMPLE_RAW_KEY,
        GITHUB_ENV: githubEnvPath,
        GITHUB_OUTPUT: githubOutputPath,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const githubEnv = readFileSync(githubEnvPath, "utf8");
    const match = githubEnv.match(
      /TAURI_SIGNING_PRIVATE_KEY<<EOF\n([^\n]+)\nEOF\n/,
    );
    expect(match?.[1]).toBeTruthy();

    const keyPath = match?.[1] ?? "";
    expect(keyPath.includes("updater.key")).toBe(true);
    expect(readFileSync(keyPath, "utf8")).toContain(
      "untrusted comment: minisign secret key",
    );
    expect(githubEnv).not.toContain("untrusted comment:");
  });
});
