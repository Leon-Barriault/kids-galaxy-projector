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

Copy the drawings, the room memory, the ID cards, and the app key
into one file. Names children typed are left out of the copy.
Run it again any time. Each run makes a new file.
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

need_cmd python3 "Python 3 is missing. Install it, then run this script again."

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
archive="${BACKUP_DIR}/kids-galaxy-${stamp}.tar.gz"
if [[ -e "$archive" ]]; then
  stamp="${stamp}-$(date +%N)"
  archive="${BACKUP_DIR}/kids-galaxy-${stamp}.tar.gz"
fi
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

python3 "$ROOT/scripts/planet_names.py" redact \
  --source "$UPLOAD_DIR" \
  --dest "$stage/pi-server/uploads"

copy_into_stage() {
  local src="$1"
  local rel="$2"
  if [[ ! -e "$src" ]]; then
    return 0
  fi
  mkdir -p "${stage}/$(dirname "$rel")"
  cp -a "$src" "${stage}/${rel}"
}

copy_into_stage "$STATE_DIR" "pi-server/state"
copy_into_stage "$CERT_DIR" "pi-server/certs"
copy_into_stage "$ROOT/android/release.keystore" "android/release.keystore"
copy_into_stage "$ROOT/android/keystore.properties" "android/keystore.properties"

tar_args=()
if [[ -d "$stage/pi-server" ]]; then
  tar_args+=(pi-server)
fi
if [[ -d "$stage/android" ]]; then
  tar_args+=(android)
fi
tar -C "$stage" -czf "$archive" "${tar_args[@]}"
(
  cd "$BACKUP_DIR"
  sha256sum "kids-galaxy-${stamp}.tar.gz" > "kids-galaxy-${stamp}.tar.gz.sha256"
)
chmod 600 "$archive" "${archive}.sha256"
echo "The safety copy is ready."
echo "  ${archive}"
echo "Children's planet names are not in this copy."
echo "Copy that file and the .sha256 file beside it onto a USB stick."
echo "Keep the stick in a locked drawer. Do not email the files."
