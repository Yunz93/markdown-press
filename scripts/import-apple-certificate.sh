#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${APPLE_CERTIFICATE:-}" ]]; then
  echo "APPLE_CERTIFICATE is not set; skipping certificate import."
  exit 0
fi

if [[ -z "${APPLE_CERTIFICATE_PASSWORD:-}" ]]; then
  echo "APPLE_CERTIFICATE_PASSWORD is required when APPLE_CERTIFICATE is set." >&2
  exit 1
fi

KEYCHAIN_PASSWORD="${KEYCHAIN_PASSWORD:-build-keychain-password}"
KEYCHAIN_PATH="$RUNNER_TEMP/build.keychain"
CERTIFICATE_PATH="$RUNNER_TEMP/certificate.p12"

echo "$APPLE_CERTIFICATE" | base64 --decode > "$CERTIFICATE_PATH"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security default-keychain -s "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -t 3600 -u "$KEYCHAIN_PATH"
security import "$CERTIFICATE_PATH" \
  -k "$KEYCHAIN_PATH" \
  -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

IDENTITY_LINE="$(security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep 'Developer ID Application' | head -n 1 || true)"
if [[ -z "$IDENTITY_LINE" ]]; then
  IDENTITY_LINE="$(security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep 'Apple Development' | head -n 1 || true)"
fi

if [[ -z "$IDENTITY_LINE" ]]; then
  echo "No code signing identity found after importing APPLE_CERTIFICATE." >&2
  security find-identity -v -p codesigning "$KEYCHAIN_PATH" >&2 || true
  exit 1
fi

SIGNING_IDENTITY="$(echo "$IDENTITY_LINE" | sed -E 's/.*"([^"]+)".*/\1/')"
echo "Imported signing identity: $SIGNING_IDENTITY"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  {
    echo "APPLE_SIGNING_IDENTITY=$SIGNING_IDENTITY"
    echo "KEYCHAIN_PATH=$KEYCHAIN_PATH"
  } >> "$GITHUB_ENV"
fi
