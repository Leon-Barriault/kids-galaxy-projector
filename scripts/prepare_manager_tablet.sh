#!/usr/bin/env bash
# Plug in the grown-up tablet only, then paste:
#   bash scripts/prepare_manager_tablet.sh
# This tablet is not locked. A grown-up must be able to leave the app.

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
  android/manager/build/outputs/apk/release/manager-release.apk \
  android/manager/build/outputs/apk/debug/manager-debug.apk
do
  if [[ -f "$candidate" ]]; then
    apk="$candidate"
    break
  fi
done

if [[ -z "$apk" ]]; then
  echo "The manager app file is missing."
  echo "Build it first with: bash scripts/build_tablets.sh"
  exit 1
fi

echo "Installing the manager app."
adb install -r "$apk"
echo "You should see Kids Galaxy Manager in the app list."
echo "This tablet is not locked. That is correct."
