#!/usr/bin/env bash
# Builds the signed, release-ready APK.
#
#   npm run android:release            # arm64 + armv7 (every real tablet)
#   npm run android:release -- --all  # also x86/x86_64 (emulators)
#
# Output: release/mad-shots-<version>.apk, verified with apksigner.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$MADSHOTS_ROOT"

TARGETS=(aarch64 armv7)
if [ "${1:-}" = "--all" ]; then TARGETS=(aarch64 armv7 i686 x86_64); fi

[ -d "$NDK_HOME" ] || { echo "✗ NDK not found at $NDK_HOME — run: npm run android:setup" >&2; exit 1; }

if [ -z "${MADSHOTS_KEYSTORE_PATH:-}" ] && [ ! -f "$MADSHOTS_ANDROID/keystore.properties" ]; then
  echo "✗ No signing key configured. Run: npm run android:keystore" >&2
  echo "  (or export MADSHOTS_KEYSTORE_PATH / MADSHOTS_KEYSTORE_PASSWORD / MADSHOTS_KEY_ALIAS)" >&2
  exit 1
fi

VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
echo "→ Building Mad Shots $VERSION for: ${TARGETS[*]}"

# `tauri android build` runs `npm run build` (typecheck + Vite) first, then
# cross-compiles the Rust library per ABI and hands off to Gradle.
npx tauri android build --apk --target "${TARGETS[@]}"

APK="$MADSHOTS_ANDROID/app/build/outputs/apk/universal/release/app-universal-release.apk"
if [ ! -f "$APK" ]; then
  echo "✗ Expected a signed APK at $APK" >&2
  ls "$(dirname "$APK")" 2>/dev/null >&2 || true
  exit 1
fi

APKSIGNER="$ANDROID_HOME/build-tools/$MADSHOTS_BUILD_TOOLS/apksigner"
echo "→ Verifying signature"
"$APKSIGNER" verify --print-certs "$APK" | sed -n '1,3p'

mkdir -p release
OUT="release/mad-shots-$VERSION.apk"
cp "$APK" "$OUT"
sha256sum "$OUT" > "$OUT.sha256"

cat <<MSG

✓ $OUT  ($(du -h "$OUT" | cut -f1))
  sha256 in $OUT.sha256

Install on a USB-connected tablet:  npm run android:install
MSG
