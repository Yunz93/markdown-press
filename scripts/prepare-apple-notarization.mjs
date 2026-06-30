#!/usr/bin/env node

import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function appendEnv(name, value) {
  if (!process.env.GITHUB_ENV) {
    return;
  }

  appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

const apiKeyContent = process.env.APPLE_API_KEY_CONTENT?.trim();
const apiKeyId = process.env.APPLE_API_KEY?.trim();
const apiIssuer = process.env.APPLE_API_ISSUER?.trim();
const appleId = process.env.APPLE_ID?.trim();
const applePassword = process.env.APPLE_PASSWORD?.trim();
const appleTeamId = process.env.APPLE_TEAM_ID?.trim();

const hasApiCredentials =
  Boolean(apiKeyContent) && Boolean(apiKeyId) && Boolean(apiIssuer);
const hasAppleIdCredentials =
  Boolean(appleId) && Boolean(applePassword) && appleTeamId.length >= 3;

if (hasApiCredentials) {
  const keyDir = mkdtempSync(join(tmpdir(), "apple-notarization-key-"));
  const keyPath = join(keyDir, `AuthKey_${apiKeyId}.p8`);
  writeFileSync(keyPath, `${apiKeyContent}\n`, "utf8");
  appendEnv("APPLE_API_KEY", apiKeyId);
  appendEnv("APPLE_API_ISSUER", apiIssuer);
  appendEnv("APPLE_API_KEY_PATH", keyPath);
  console.log(`Prepared App Store Connect API notarization at ${keyPath}`);
  process.exit(0);
}

if (hasAppleIdCredentials) {
  appendEnv("APPLE_ID", appleId);
  appendEnv("APPLE_PASSWORD", applePassword);
  appendEnv("APPLE_TEAM_ID", appleTeamId);
  console.log("Prepared Apple ID notarization credentials.");
  process.exit(0);
}

if (apiKeyContent || appleId || applePassword || appleTeamId) {
  console.log(
    "Skipping notarization: Apple credentials are partially configured. Provide either APPLE_API_KEY_CONTENT + APPLE_API_KEY + APPLE_API_ISSUER, or APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID.",
  );
} else {
  console.log("Apple notarization credentials not configured; skipping.");
}
