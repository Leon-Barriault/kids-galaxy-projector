#!/usr/bin/env bash
# Make the stamp used to sign the tablet apps.
# Paste:
#   bash scripts/create_tablet_keystore.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE="$ROOT/android/release.keystore"
PROPS="$ROOT/android/keystore.properties"
ALIAS="kidsgalaxy"

usage() {
  cat <<'EOF'
Usage: bash scripts/create_tablet_keystore.sh

Make the app key once. A second run leaves the same key in place.
The key stays on this computer. Copy it onto the USB stick with the
safety copy. Do not email it. A lost key means the next app install
asks to remove the old app first.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 0 ]]; then
  echo "Unknown option: $1" >&2
  exit 1
fi

if [[ -f "$KEYSTORE" && -f "$PROPS" ]]; then
  echo "The app key is already here. It was left in place."
  exit 0
fi

if ! command -v keytool >/dev/null 2>&1; then
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/keytool" ]]; then
    PATH="${JAVA_HOME}/bin:${PATH}"
    export PATH
  fi
fi

if ! command -v keytool >/dev/null 2>&1; then
  echo "The Java tool is missing, so the app key was not made."
  echo "Install Java, or install Android Studio, then run this again."
  exit 1
fi

password="$(openssl rand -hex 16)"
umask 077
keytool_err="$(mktemp)"
if ! keytool -genkeypair -keystore "$KEYSTORE" -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 9125 \
  -storepass "$password" -keypass "$password" \
  -dname "CN=Kids Galaxy Room, O=Kids Galaxy, C=CA" \
  >"/dev/null" 2>"$keytool_err"
then
  cat "$keytool_err" >&2
  rm -f "$keytool_err"
  exit 1
fi
rm -f "$keytool_err"
cat >"$PROPS" <<EOF
storeFile=release.keystore
storePassword=${password}
keyAlias=${ALIAS}
keyPassword=${password}
EOF
chmod 600 "$KEYSTORE" "$PROPS"
umask 022
echo "The app key is ready."
echo "It is stored in android/release.keystore on this computer."
echo "Copy it to the USB stick with the safety copy. Do not email it."
