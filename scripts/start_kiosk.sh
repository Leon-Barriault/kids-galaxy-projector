#!/bin/bash
# Start Chromium in kiosk mode for the galaxy visualization
# Ideal for projector output

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/wsl.sh
source "$ROOT/scripts/lib/wsl.sh"
if is_wsl; then
  echo "This Ubuntu is inside Windows. It has no projector display of its own."
  echo "Run: bash scripts/open_projector.sh"
  echo "That opens Chrome on Windows."
  exit 1
fi

export DISPLAY=:0

# Hide mouse cursor after a few seconds
unclutter -idle 2 -root &

# Disable screen blanking
xset s off
xset -dpms
xset s noblank

# Launch Chromium
chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  http://localhost:8000/ \
  2>/dev/null
