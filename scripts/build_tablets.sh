#!/usr/bin/env bash
# Build the kid app and the manager app for this room.
# Run scripts/setup_room.sh first. Then paste:
#   bash scripts/build_tablets.sh
# The first build can take about 30 minutes.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

card="pi-server/state/room-card.txt"
if [[ ! -f "$card" ]]; then
  echo "The room card is missing."
  echo "Run this first: bash scripts/setup_room.sh"
  exit 1
fi

ADDRESS="$(awk -F= '/^ADDRESS=/{ print $2 }' "$card")"
PASSWORD="$(awk -F= '/^PASSWORD=/{ print $2 }' "$card")"

if [[ -z "$ADDRESS" || -z "$PASSWORD" ]]; then
  echo "The room card does not have an address and a password."
  echo "Run this again: bash scripts/setup_room.sh"
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" && -d "${HOME}/Android/Sdk" ]]; then
  export ANDROID_HOME="${HOME}/Android/Sdk"
fi

if [[ -z "${ANDROID_HOME:-}" || ! -d "${ANDROID_HOME}" ]]; then
  echo "The Android tools are missing."
  echo "A helper must install Android Studio, then run this command again."
  exit 1
fi

if [[ ! -f android/app/src/main/assets/client.p12 ]]; then
  echo "The kid ID card is missing from the app folder."
  echo "Run this first: bash scripts/setup_room.sh"
  exit 1
fi

echo "Building both apps for ${ADDRESS}."
echo "You should see BUILD SUCCESSFUL twice. Please wait."
(
  cd android
  ./gradlew :app:assembleRelease :manager:assembleRelease \
    -PkidsGalaxyServerHost="$ADDRESS" \
    -PkidsGalaxyCertPassword="$PASSWORD"
)

echo "Both apps are built."
echo "Next, erase the kid tablet and run: bash scripts/prepare_kid_tablet.sh"
echo "Then plug in the manager tablet and run: bash scripts/prepare_manager_tablet.sh"
