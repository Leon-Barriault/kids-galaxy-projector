#!/usr/bin/env bash
# Open the galaxy page full screen on this computer.
# Paste this in Terminal:
#   bash scripts/open_projector.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/wsl.sh
source "$ROOT/scripts/lib/wsl.sh"

url="${1:-http://127.0.0.1:8000/}"

if is_wsl; then
  echo "This Ubuntu is inside Windows. Open Chrome on Windows."
  if command -v powershell.exe >/dev/null 2>&1; then
    wall_script="$ROOT/scripts/windows/kids-galaxy-open-wall.ps1"
    if command -v wslpath >/dev/null 2>&1; then
      wall_script="$(wslpath -w "$wall_script")"
    fi
    status=0
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$wall_script" || status=$?
    exit "$status"
  fi
  echo "Open a browser on Windows and go to:"
  echo "  ${url}"
  exit 1
fi

for bin in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$bin" >/dev/null 2>&1; then
    exec "$bin" --start-fullscreen "$url"
  fi
done

echo "Chrome is not installed."
echo "Install it, or open a browser yourself and go to:"
echo "  ${url}"
exit 1
