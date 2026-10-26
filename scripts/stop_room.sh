#!/usr/bin/env bash
# Stop the galaxy program without erasing planets.
# Open Terminal in this project folder, then paste:
#   bash scripts/stop_room.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed, so there is nothing to stop."
  exit 0
fi

docker compose -f docker-compose.secure.yml down
echo "The galaxy program is stopped. Planets are still saved."
echo "Shut down the computer from the power menu when you are done."
