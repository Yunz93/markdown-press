#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const rawTag =
  process.argv[2] ||
  process.env.RELEASE_TAG ||
  process.env.GITHUB_REF_NAME ||
  process.env.GITHUB_REF ||
  '';

const tag = rawTag.replace(/^refs\/tags\//, '').trim();

if (!tag) {
  console.error('Missing tag. Pass a tag argument or set GITHUB_REF_NAME / RELEASE_TAG.');
  process.exit(1);
}

const version = tag.replace(/^v/, '');
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!semverPattern.test(version)) {
  console.error(`Unsupported tag format "${tag}". Expected formats like v1.2.3 or 1.2.3.`);
  process.exit(1);
}

function writeJsonVersion(filePath) {
  const json = JSON.parse(readFileSync(filePath, 'utf8'));
  json.version = version;
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function writeCargoVersion(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const pattern = /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/;

  if (!pattern.test(source)) {
    console.error(`Failed to update Cargo version in ${filePath}.`);
    process.exit(1);
  }

  const next = source.replace(
    pattern,
    (_, prefix, _current, suffix) => `${prefix}${version}${suffix}`,
  );

  writeFileSync(filePath, next);
}

writeJsonVersion(resolve(projectRoot, 'package.json'));
writeJsonVersion(resolve(projectRoot, 'src-tauri', 'tauri.conf.json'));
writeCargoVersion(resolve(projectRoot, 'src-tauri', 'Cargo.toml'));

console.log(`Synced release version to ${version} from tag ${tag}.`);
