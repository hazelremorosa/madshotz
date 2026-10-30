#!/usr/bin/env bash
# One-time toolchain install for building the Android APK on Linux / WSL.
#
#   npm run android:setup
#
# Installs (only what's missing): Android command-line tools, platform-tools
# (adb), the SDK platform, build-tools (apksigner/zipalign), the NDK, and the
# Rust Android targets. Needs: JDK 17+, Rust (rustup), Node 18+, curl, unzip.
set -euo pipefail
source "$(dirname "$0")/env.sh"

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 is required: $2" >&2; exit 1; }; }
need java "install a JDK 17+ (e.g. sudo apt install openjdk-17-jdk)"
need rustup "install Rust from https://rustup.rs"
need curl "sudo apt install curl"
need unzip "sudo apt install unzip"

java_major="$(java -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1)"
if [ "${java_major:-0}" -lt 17 ]; then
  echo "✗ Gradle needs JDK 17 or newer (found ${java_major:-none})." >&2
  exit 1
fi

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "→ Installing Android command-line tools into $ANDROID_HOME"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/clt.zip" \
    https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
  unzip -q "$tmp/clt.zip" -d "$tmp"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi

echo "→ Accepting SDK licences"
yes | sdkmanager --licenses >/dev/null 2>&1 || true

echo "→ Installing SDK packages (first run downloads ~3 GB)"
sdkmanager --install \
  "platform-tools" \
  "platforms;$MADSHOTS_PLATFORM" \
  "build-tools;$MADSHOTS_BUILD_TOOLS" \
  "ndk;$MADSHOTS_NDK_VERSION"

echo "→ Adding Rust Android targets"
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

echo "→ Installing npm dependencies"
(cd "$MADSHOTS_ROOT" && npm install)

cat <<MSG

✓ Android toolchain ready.

Add these to your shell profile (~/.bashrc) so Android Studio / tauri find them:

  export ANDROID_HOME="$ANDROID_HOME"
  export NDK_HOME="$NDK_HOME"
  export JAVA_HOME="$JAVA_HOME"

Next: npm run android:keystore   (once — creates your release signing key)
      npm run android:release    (builds the signed APK)
MSG
