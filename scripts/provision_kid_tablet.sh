#!/usr/bin/env bash
# Install the drawing app and turn on lock mode.
# The tablet must be erased, with no account, and plugged in alone.
# Paste:
#   bash scripts/provision_kid_tablet.sh --name kid-1
#   bash scripts/provision_kid_tablet.sh --skip-build

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/provision_kid_tablet.sh [options]

Install the signed drawing app on the one tablet that is plugged in.
Then turn on lock mode. A second run installs again and keeps lock mode.

Options:
  --name NAME     Kid card to put in the app. Default: kid-1.
  --apk PATH      Install this app file instead of building one.
  --skip-build    Use the app file that is already built.
  --debug         Build the lab app. Lock mode still turns on.
  --help          Show this help.

What this cannot do:
  It cannot turn on "start when the charger is plugged in".
  That switch, if the tablet has one, is in the tablet menus.
  A grown-up with the USB cable can still reach this tablet.
  That is the recovery door. There is no paid management service.
EOF
}

NAME="kid-1"
APK=""
SKIP_BUILD=0
DEBUG=0
SECONDS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --name)
      [[ $# -ge 2 ]] || die "Add a short name after --name."
      NAME="$2"
      shift 2
      ;;
    --apk)
      [[ $# -ge 2 ]] || die "Add the app file after --apk."
      APK="$2"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --debug)
      DEBUG=1
      shift
      ;;
    *)
      die "Unknown option: $1. Run: bash scripts/provision_kid_tablet.sh --help"
      ;;
  esac
done

need_cmd adb "The tablet tool is missing. Install adb, then run this again."

if [[ "$SKIP_BUILD" -eq 0 && -z "$APK" ]]; then
  card="$STATE_DIR/room-card.txt"
  [[ -f "$card" ]] || die "The room card is missing. Run bash scripts/setup_room.sh first."
  address="$(awk -F= '/^ADDRESS=/{ print $2 }' "$card")"
  password="$(awk -F= '/^PASSWORD=/{ print $2 }' "$card")"
  [[ -n "$address" && -n "$password" ]] || die "The room card has no address. Run setup again."
  if [[ ! -f "$CERT_DIR/tablets/${NAME}/client.p12" ]]; then
    SERVER_IP="$address" bash "$ROOT/scripts/production_certs.sh" issue-tablet --role kid --name "$NAME"
  fi
  role="$(tr -d '[:space:]' < "$CERT_DIR/tablets/${NAME}/role.txt")"
  [[ "$role" == "kid" ]] || die "The card named ${NAME} is not a kid card."
  bash "$ROOT/scripts/production_certs.sh" use-tablet --name "$NAME"
  if [[ "$DEBUG" -eq 0 ]]; then
    bash "$ROOT/scripts/create_tablet_keystore.sh"
  fi
  if [[ -z "${ANDROID_HOME:-}" && -d "${HOME}/Android/Sdk" ]]; then
    export ANDROID_HOME="${HOME}/Android/Sdk"
  fi
  if [[ -z "${ANDROID_HOME:-}" || ! -d "${ANDROID_HOME}" ]]; then
    die "The Android tools are missing. A helper must install Android Studio."
  fi
  echo "Building the kid app for ${address}."
  (
    cd "$ROOT/android"
    if [[ "$DEBUG" -eq 1 ]]; then
      ./gradlew :app:assembleDebug -PkidsGalaxyServerHost="$address"
    else
      ./gradlew :app:assembleRelease \
        -PkidsGalaxyServerHost="$address" \
        -PkidsGalaxyCertPassword="$password"
    fi
  )
fi

if [[ -z "$APK" ]]; then
  if [[ "$DEBUG" -eq 1 && -f "$ROOT/android/app/build/outputs/apk/debug/app-debug.apk" ]]; then
    APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
  elif [[ -f "$ROOT/android/app/build/outputs/apk/release/app-release.apk" ]]; then
    APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
  elif [[ -f "$ROOT/android/app/build/outputs/apk/debug/app-debug.apk" ]]; then
    APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
  fi
fi
[[ -n "$APK" && -f "$APK" ]] || die "The kid app file is missing. Build it first."

adb start-server >/dev/null
mapfile -t ready < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')
if [[ "${#ready[@]}" -eq 0 ]]; then
  die "No tablet is ready. Plug in the USB cable. On the tablet, tap Allow."
fi
if [[ "${#ready[@]}" -ne 1 ]]; then
  die "More than one tablet is plugged in. Unplug the others."
fi

echo "Installing the kid app."
adb install -r "$APK"

if adb shell dpm list-owners 2>/dev/null | grep -q "$KID_PACKAGE"; then
  echo "Lock mode is already on."
else
  echo "Turning on lock mode."
  if ! adb shell dpm set-device-owner "$KID_ADMIN"; then
    echo "Lock mode did not turn on."
    echo "Erase the kid tablet. Do not add an account. Then run this again."
    exit 1
  fi
fi

adb shell am start -n "${KID_PACKAGE}/.MainActivity" >/dev/null
locked=0
for _ in $(seq 1 20); do
  if adb shell dumpsys activity activities 2>/dev/null | grep -E -q 'mLockTaskMode=(LOCKED|LOCK_TASK)|lockTaskMode=(LOCKED|LOCK_TASK)'; then
    locked=1
    break
  fi
  sleep 1
done

echo "You should see the drawing app fill the screen."
if [[ "$locked" -eq 1 ]]; then
  echo "Lock mode is on. Home should stay in the drawing app."
else
  echo "The app is the device owner. Lock mode was not confirmed yet."
  echo "Press Home. If the drawing app stays open, lock mode is on."
fi
echo "Notifications, the Play Store, and browsers are blocked when this app is the owner."
echo "This script cannot turn on start-when-plugged-in."
echo "If the tablet has that switch, turn it on once under Battery or Display."
echo "This took ${SECONDS} seconds."
