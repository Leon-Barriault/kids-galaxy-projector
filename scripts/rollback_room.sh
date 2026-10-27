#!/usr/bin/env bash
# Put the previous galaxy program back.
# Paste:
#   bash scripts/rollback_room.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/rollback_room.sh

Start the program that was running before the last update.
Planets and ID cards stay as they are. Safe to run again.
If there was no earlier program, this stops and says so.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 0 ]]; then
  die "Unknown option: $1. Run: bash scripts/rollback_room.sh --help"
fi

need_cmd docker "Docker is missing. There is no program to put back."
docker info >/dev/null 2>&1 || die "Docker is installed, but this user cannot use it."

if ! docker image inspect "$PREVIOUS_IMAGE" >/dev/null 2>&1; then
  die "There is no older copy to go back to."
fi

docker tag "$PREVIOUS_IMAGE" "$IMAGE_REF"
compose up -d --no-build --force-recreate
echo "The previous program is running."

if [[ -f "$RELEASE_FILE" ]]; then
  saved_head="$(awk -F= '/^GIT_HEAD=/{ print $2 }' "$RELEASE_FILE")"
  current_head="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
  if [[ -n "$saved_head" && "$saved_head" != "none" && "$saved_head" != "$current_head" ]]; then
    if [[ -z "$(git -C "$ROOT" status --porcelain)" ]]; then
      git -C "$ROOT" checkout --detach "$saved_head"
      echo "The computer files match the running program."
    else
      echo "The program was put back. The files on disk were left as they are."
    fi
  fi
fi

bash "$ROOT/scripts/check_room.sh"
