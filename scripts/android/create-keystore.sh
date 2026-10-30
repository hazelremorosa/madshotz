#!/usr/bin/env bash
# Creates the release signing key, once, and wires it into the Gradle build.
#
#   npm run android:keystore
#
# ⚠ BACK THE KEYSTORE UP. Android only installs an update over an existing app
# if it's signed with the same key. Lose it and every tablet has to uninstall
# Mad Shots (wiping its settings, events and templates) before it can take a
# new version.
set -euo pipefail
source "$(dirname "$0")/env.sh"

KEYSTORE="${MADSHOTS_KEYSTORE_PATH:-$HOME/.madshots/mad-shots-release.jks}"
ALIAS="${MADSHOTS_KEY_ALIAS:-madshots}"
PROPS="$MADSHOTS_ANDROID/keystore.properties"

if [ -f "$KEYSTORE" ]; then
  echo "✓ Keystore already exists at $KEYSTORE — not overwriting it."
else
  command -v keytool >/dev/null || { echo "✗ keytool not found — it ships with the JDK." >&2; exit 1; }
  mkdir -p "$(dirname "$KEYSTORE")"
  chmod 700 "$(dirname "$KEYSTORE")"

  read -r -s -p "Choose a keystore password (6+ chars): " PASS; echo
  read -r -s -p "Repeat it: " PASS2; echo
  [ "$PASS" = "$PASS2" ] || { echo "✗ Passwords differ." >&2; exit 1; }
  [ "${#PASS}" -ge 6 ] || { echo "✗ Too short." >&2; exit 1; }

  # PKCS12 keystores use one password for the store and the key.
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" -storetype PKCS12 \
    -alias "$ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=Mad Shots, O=Mad Shots, C=PH"
  chmod 600 "$KEYSTORE"
fi

if [ -f "$PROPS" ]; then
  echo "✓ $PROPS already exists — leaving it alone."
else
  [ -n "${PASS:-}" ] || { read -r -s -p "Keystore password: " PASS; echo; }
  umask 077
  cat >"$PROPS" <<PROPS
# Release signing for Mad Shots. Git-ignored — never commit this file.
storeFile=$KEYSTORE
keyAlias=$ALIAS
password=$PASS
PROPS
  echo "✓ Wrote $PROPS"
fi

cat <<MSG

Now back up $KEYSTORE and its password somewhere safe (a password manager,
an encrypted drive). Without both you can never update the installed app.
MSG
