#!/bin/bash
# Start Chromium in kiosk mode for the galaxy visualization
# Ideal for projector output

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
