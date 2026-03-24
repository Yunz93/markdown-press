#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = join(projectRoot, 'dist');
const distAssetsDir = join(distDir, 'assets');
const appBundlePath = join(projectRoot, 'src-tauri', 'target', 'release', 'bundle', 'macos', 'MarkdownPress.app');

const shouldBuildApp = process.argv.includes('--app');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertExists(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    process.exit(1);
  }
}

function readEntrypointAssets() {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const cssMatch = html.match(/href="\.\/*assets\/([^"]+\.css)"/);
  const jsMatch = html.match(/src="\.\/*assets\/([^"]+\.js)"/);

  return {
    cssAsset: cssMatch?.[1] ?? null,
    jsAsset: jsMatch?.[1] ?? null,
  };
}

run('npm', ['run', 'build']);

assertExists(distDir, 'dist output');
assertExists(join(distDir, 'index.html'), 'dist index.html');
assertExists(distAssetsDir, 'dist assets directory');

const { cssAsset, jsAsset } = readEntrypointAssets();

if (!cssAsset || !jsAsset) {
  console.error('Missing entrypoint assets in dist/index.html');
  process.exit(1);
}

assertExists(join(distAssetsDir, cssAsset), 'entrypoint CSS asset');
assertExists(join(distAssetsDir, jsAsset), 'entrypoint JS asset');

if (shouldBuildApp) {
  run('npx', ['tauri', 'build', '--bundles', 'app', '--no-sign']);
  assertExists(appBundlePath, 'macOS .app bundle');
}

const checklist = [
  'Cold launch the packaged app and verify the first opened file has correct editor width.',
  'In Preview mode, open Outline in a non-fullscreen window and confirm the panel renders and headings jump correctly.',
  'Open a note with fenced code blocks and confirm syntax highlighting still works in the packaged app.',
  'Compare Editor mode styling against dev: caret, frontmatter colors, markdown token colors, and line wrapping.',
  'Verify wikilinks and embeds in Preview: [[file]], [[#heading]], ![[image.png]], and non-image attachments.',
  'Click external links from Preview and confirm the system browser opens.',
  'Switch between Editor / Preview / Split, resize the window, and confirm layout widths stay stable.',
];

console.log('\nRelease smoke check passed.\n');
console.log(`Verified dist assets: ${cssAsset}, ${jsAsset}`);
if (shouldBuildApp) {
  console.log(`Verified app bundle: ${appBundlePath}`);
}

console.log('\nManual checklist:');
for (const item of checklist) {
  console.log(`- ${item}`);
}
