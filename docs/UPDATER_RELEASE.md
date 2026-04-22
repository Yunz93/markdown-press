# Updater Release Notes

This repository now uses the Tauri updater plugin for Windows in-app updates.

## One-time setup

1. Generate a Tauri updater keypair:

```bash
npm run tauri signer generate -- --ci -w /secure/path/markdown-press-updater.key
```

2. Keep the private key outside the repository.
3. Set these GitHub Actions secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if your private key uses a password
4. The public key embedded in [src-tauri/tauri.conf.json](/Users/yunz/Code/VibeCoding/markdown-press/src-tauri/tauri.conf.json:1) must match the private key used in CI. If you rotate the keypair, update the embedded public key too.

## Per-release checklist

1. Bump or tag the release as usual. Tagged releases still sync versions through `npm run release:sync-version`.
2. Let GitHub Actions build the tagged release.
3. After the workflow finishes, confirm the GitHub Release contains:
   - the Windows NSIS installer
   - updater signature assets
   - `latest.json`
4. Install the new release on at least one Windows machine where an older build is already present.
5. Open `Settings -> About` and confirm:
   - the app detects the newer version
   - release notes load
   - download and install complete successfully

## Scope

- Windows: in-app update checks and install flow are supported.
- macOS: still manual download/install from GitHub Releases.
