#!/usr/bin/env bash
# Plug in one erased kid tablet, then paste:
#   bash scripts/prepare_kid_tablet.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v adb >/dev/null 2>&1; then
  echo "The tablet tool is missing."
  echo "Type this, then run the same command again:"
  echo "  sudo apt-get update && sudo apt-get install -y adb"
  exit 1
fi

adb start-server >/dev/null
mapfile -t ready < <(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }')

if [[ "${#ready[@]}" -eq 0 ]]; then
  echo "No tablet is ready."
  echo "Plug in the USB cable. On the tablet, tap Allow."
  echo "Then run this command again."
  exit 1
fi

if [[ "${#ready[@]}" -ne 1 ]]; then
  echo "More than one tablet is plugged in. Unplug the others."
  exit 1
fi

apk=""
for candidate in \
  android/app/build/outputs/apk/release/app-release.apk \
  android/app/build/outputs/apk/debug/app-debug.apk
do
  if [[ -f "$candidate" ]]; then
    apk="$candidate"
    break
  fi
done

if [[ -z "$apk" ]]; then
  echo "The kid app file is missing."
  echo "Build it first with: bash scripts/build_tablets.sh"
  exit 1
fi

echo "Installing the kid app."
adb install -r "$apk"

echo "Turning on lock mode."
if ! adb shell dpm set-device-owner com.kidsgalaxy/.DeviceAdminReceiver; then
  echo "Lock mode did not turn on."
  echo "Erase the kid tablet. Do not add a Google account. Then run this again."
  exit 1
fi

echo "You should see the drawing app fill the screen."
echo "Press Home. The drawing app should stay open."
