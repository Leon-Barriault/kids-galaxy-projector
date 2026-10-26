#!/usr/bin/env bash
# Open the galaxy page full screen on this computer.
# Paste this in Terminal:
#   bash scripts/open_projector.sh

set -euo pipefail

url="${1:-http://127.0.0.1:8000/}"

for bin in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$bin" >/dev/null 2>&1; then
    exec "$bin" --start-fullscreen "$url"
  fi
done

echo "Chrome is not installed."
echo "Install it, or open a browser yourself and go to:"
echo "  ${url}"
exit 1
