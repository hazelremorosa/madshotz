#!/usr/bin/env bash
# Shared toolchain locations for the Android scripts. Sourced, not run.
#
# Everything is overridable from the environment, so a machine with Android
# Studio's SDK elsewhere just exports ANDROID_HOME first.

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# Pinned so every machine (and CI) builds with the same toolchain.
MADSHOTS_NDK_VERSION="${MADSHOTS_NDK_VERSION:-28.2.13676358}"
MADSHOTS_BUILD_TOOLS="${MADSHOTS_BUILD_TOOLS:-36.1.0}"
MADSHOTS_PLATFORM="${MADSHOTS_PLATFORM:-android-37.0}"

export NDK_HOME="${NDK_HOME:-$ANDROID_HOME/ndk/$MADSHOTS_NDK_VERSION}"

# Gradle needs JDK 17+. Fall back to whatever `java` on PATH belongs to.
if [ -z "${JAVA_HOME:-}" ] && command -v java >/dev/null 2>&1; then
  JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"
  export JAVA_HOME
fi

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# Repo root, whichever directory the caller ran from.
MADSHOTS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MADSHOTS_ANDROID="$MADSHOTS_ROOT/src-tauri/gen/android"
