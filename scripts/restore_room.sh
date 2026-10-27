#!/usr/bin/env bash
# Put a safety copy back on this computer.
# Paste:
#   bash scripts/restore_room.sh --from /media/usb/kids-galaxy-YYYYMMDD-HHMMSS.tar.gz
#   bash scripts/restore_room.sh --from <file> --start

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/restore_room.sh --from ARCHIVE [--start]

Put planets, ID cards, and the app key back from a safety copy.
The copy that is on the computer now is moved aside first.
Add --start to start the galaxy program after the files are back.
Run it again with the same file if you need to. That is safe.
EOF
}

ARCHIVE=""
START=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --from)
      [[ $# -ge 2 ]] || die "Add the safety-copy file after --from."
      ARCHIVE="$2"
      shift 2
      ;;
    --start)
      START=1
      shift
      ;;
    *)
      die "Unknown option: $1. Run: bash scripts/restore_room.sh --help"
      ;;
  esac
done

[[ -n "$ARCHIVE" ]] || die "Add --from and the safety-copy file."
[[ -f "$ARCHIVE" ]] || die "That safety copy was not found."

if [[ -f "${ARCHIVE}.sha256" ]]; then
  archive_dir="$(cd "$(dirname "$ARCHIVE")" && pwd)"
  archive_name="$(basename "$ARCHIVE")"
  if ! (cd "$archive_dir" && sha256sum -c "${archive_name}.sha256" --status); then
    die "The safety copy does not match its check file. Do not use it."
  fi
  echo "The safety copy matches its check file."
else
  echo "No check file was beside the copy. Continuing."
fi

if tar -tzf "$ARCHIVE" | grep -E '(^/|(^|/)\.\.(/|$))' >/dev/null; then
  die "This safety copy has an unsafe path. Do not use it."
fi

if have_docker; then
  compose down || true
  echo "The galaxy program is stopped."
fi

stamp="$(date +%Y%m%d-%H%M%S)"
hold="${BACKUP_DIR}/hold-${stamp}"
mkdir -p "$hold"
for path in pi-server/uploads pi-server/state pi-server/certs android/release.keystore android/keystore.properties; do
  if [[ -e "$ROOT/$path" ]]; then
    mkdir -p "$hold/$(dirname "$path")"
    mv "$ROOT/$path" "$hold/$path"
  fi
done

tar -C "$ROOT" -xzf "$ARCHIVE"
echo "The files are back."
echo "The previous files are in ${hold}."

if [[ "$START" -eq 1 ]]; then
  if ! have_docker; then
    die "Docker is not running, so the galaxy program was not started."
  fi
  compose up -d --no-build || compose up -d --build
  bash "$ROOT/scripts/check_room.sh"
else
  echo "Start the room with: bash scripts/setup_room.sh"
fi
