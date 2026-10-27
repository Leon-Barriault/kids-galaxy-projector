#!/usr/bin/env bash
# Save the planets, the ID cards, and the app key.
# Paste:
#   bash scripts/backup_room.sh
#   bash scripts/backup_room.sh --output /media/usb

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/backup_room.sh [--output DIR]

Copy the planets, the room memory, the ID cards, and the app key
into one file. Run it again any time. Each run makes a new file.
The file is private to this computer user. Copy it to a USB stick
and keep that stick in a locked drawer. Do not email it.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --output)
      [[ $# -ge 2 ]] || die "Add a folder after --output."
      BACKUP_DIR="$2"
      shift 2
      ;;
    *)
      die "Unknown option: $1. Run: bash scripts/backup_room.sh --help"
      ;;
  esac
done

[[ -d "$CERT_DIR" ]] || die "The ID cards are missing. Run bash scripts/setup_room.sh first."

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
archive="${BACKUP_DIR}/kids-galaxy-${stamp}.tar.gz"
if [[ -e "$archive" ]]; then
  stamp="${stamp}-$(date +%N)"
  archive="${BACKUP_DIR}/kids-galaxy-${stamp}.tar.gz"
fi
list="$(mktemp)"
trap 'rm -f "$list"' EXIT

add_path() {
  if [[ -e "$ROOT/$1" ]]; then
    printf '%s\n' "$1"
  fi
}

{
  add_path "pi-server/uploads"
  add_path "pi-server/state"
  add_path "pi-server/certs"
  add_path "android/release.keystore"
  add_path "android/keystore.properties"
} >"$list"

tar -C "$ROOT" -czf "$archive" -T "$list"
(
  cd "$BACKUP_DIR"
  sha256sum "kids-galaxy-${stamp}.tar.gz" > "kids-galaxy-${stamp}.tar.gz.sha256"
)
chmod 600 "$archive" "${archive}.sha256"
echo "The safety copy is ready."
echo "  ${archive}"
echo "Copy that file and the .sha256 file beside it onto a USB stick."
echo "Keep the stick in a locked drawer. Do not email the files."
