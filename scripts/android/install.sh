#!/usr/bin/env bash
# Installs the latest release APK on a tablet connected over USB (or Wi-Fi adb).
#
#   npm run android:install
#
# `-r` keeps the app's data (settings, events, templates) when upgrading. It
# only works if the installed copy was signed with the same key.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$MADSHOTS_ROOT"

ADB="$ANDROID_HOME/platform-tools/adb"
# Under WSL, a USB tablet is usually only visible to Windows' own adb.
if ! "$ADB" devices | grep -q $'\tdevice$' && command -v adb.exe >/dev/null 2>&1; then
  ADB="adb.exe"
fi

APK="$(ls -t release/mad-shots-*.apk 2>/dev/null | head -1 || true)"
[ -n "$APK" ] || { echo "✗ No APK in release/ — run: npm run android:release" >&2; exit 1; }

echo "→ Devices:"
"$ADB" devices -l
echo "→ Installing $APK"
if [ "$ADB" = "adb.exe" ]; then APK="$(wslpath -w "$APK")"; fi
"$ADB" install -r "$APK"
"$ADB" shell monkey -p com.madshots.booth -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
echo "✓ Installed and launched."
