#!/usr/bin/env node

import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiKeyContent = process.env.APPLE_API_KEY_CONTENT?.trim();
const apiKeyId = process.env.APPLE_API_KEY?.trim();
const apiIssuer = process.env.APPLE_API_ISSUER?.trim();

if (!apiKeyContent) {
  console.log(
    "APPLE_API_KEY_CONTENT is not set; skipping App Store Connect API key setup.",
  );
  process.exit(0);
}

if (!apiKeyId || !apiIssuer) {
  console.error(
    "APPLE_API_KEY_CONTENT requires APPLE_API_KEY and APPLE_API_ISSUER to be set.",
  );
  process.exit(1);
}

const keyDir = mkdtempSync(join(tmpdir(), "apple-notarization-key-"));
const keyPath = join(keyDir, `AuthKey_${apiKeyId}.p8`);
writeFileSync(keyPath, `${apiKeyContent.trim()}\n`, "utf8");

if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `APPLE_API_KEY_PATH=${keyPath}\n`);
}

console.log(`Prepared App Store Connect API key at ${keyPath}`);
