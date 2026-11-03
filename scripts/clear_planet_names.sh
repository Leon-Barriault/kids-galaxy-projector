#!/usr/bin/env bash
# Blank saved planet names so they do not travel to the next daycare.
# Drawings stay. Running this again is safe.
# Paste:
#   bash scripts/clear_planet_names.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

need_cmd python3 "Python 3 is missing. Install it, then run this script again."

python3 "$ROOT/scripts/planet_names.py" clear --uploads "$UPLOAD_DIR"
echo "The planet names were cleared."
