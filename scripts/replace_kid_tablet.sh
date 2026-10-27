#!/usr/bin/env bash
# Replace one kid tablet from an erased tablet.
# Paste:
#   bash scripts/replace_kid_tablet.sh --name kid-2 --old-name kid-1

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/replace_kid_tablet.sh --name NAME [--old-name NAME]

Cancel the lost tablet, make a card for the new one, build the app,
install it, and turn on lock mode. The new tablet must be erased,
with no account, and it must be the only tablet plugged in.

The first build on a computer can take about 30 minutes.
A later replacement is usually much shorter.
This prints how many seconds it took.
EOF
}

NAME=""
OLD_NAME=""

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
    --old-name)
      [[ $# -ge 2 ]] || die "Add the lost tablet name after --old-name."
      OLD_NAME="$2"
      shift 2
      ;;
    *)
      die "Unknown option: $1. Run: bash scripts/replace_kid_tablet.sh --help"
      ;;
  esac
done

[[ -n "$NAME" ]] || die "Add --name for the new tablet. Example: --name kid-2"

card="$STATE_DIR/room-card.txt"
[[ -f "$card" ]] || die "The room card is missing. Run bash scripts/setup_room.sh first."
address="$(awk -F= '/^ADDRESS=/{ print $2 }' "$card")"
[[ -n "$address" ]] || die "The room card has no address. Run setup again."

started=$SECONDS
if [[ -n "$OLD_NAME" ]]; then
  SERVER_IP="$address" bash "$ROOT/scripts/production_certs.sh" revoke-tablet --name "$OLD_NAME"
fi
SERVER_IP="$address" bash "$ROOT/scripts/production_certs.sh" issue-tablet --role kid --name "$NAME"
bash "$ROOT/scripts/provision_kid_tablet.sh" --name "$NAME"
echo "Replacement finished in $((SECONDS - started)) seconds."
