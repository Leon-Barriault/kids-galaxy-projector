#!/usr/bin/env bash
# Build the galaxy program again, and keep the previous copy for rollback.
# Paste one of these:
#   bash scripts/update_room.sh --version v1.2.0
#   bash scripts/update_room.sh --rebuild

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/update_room.sh --version NAME
       bash scripts/update_room.sh --rebuild

--version checks out that release and builds it.
--rebuild builds the files already on this computer.
The previous program is kept. If the new one does not answer,
this command puts the previous one back.
EOF
}

VERSION=""
REBUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --version)
      [[ $# -ge 2 ]] || die "Add the version name after --version."
      VERSION="$2"
      shift 2
      ;;
    --rebuild)
      REBUILD=1
      shift
      ;;
    *)
      die "Unknown option: $1. Run: bash scripts/update_room.sh --help"
      ;;
  esac
done

if [[ -n "$VERSION" && "$REBUILD" -eq 1 ]]; then
  die "Use --version or --rebuild, not both."
fi
if [[ -z "$VERSION" && "$REBUILD" -eq 0 ]]; then
  die "Add --version or --rebuild. Run: bash scripts/update_room.sh --help"
fi

need_cmd docker "Docker is missing. Install it, then run this again."
need_cmd git "Git is missing, so this computer cannot change version."
docker info >/dev/null 2>&1 || die "Docker is installed, but this user cannot use it."

if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  die "This computer has unfinished changes. Ask a helper before updating."
fi

mkdir -p "$STATE_DIR"
head_now="$(git -C "$ROOT" rev-parse HEAD)"
if docker image inspect "$IMAGE_REF" >/dev/null 2>&1; then
  docker tag "$IMAGE_REF" "$PREVIOUS_IMAGE"
  echo "The current program was saved for rollback."
else
  echo "There is no current program to save. A failed update cannot roll back."
fi

umask 077
cat >"$RELEASE_FILE" <<EOF
PREVIOUS_IMAGE=${PREVIOUS_IMAGE}
GIT_HEAD=${head_now}
SAVED_AT=$(date -Is)
EOF
umask 022
chmod 600 "$RELEASE_FILE"

if [[ -n "$VERSION" ]]; then
  echo "Fetching ${VERSION}."
  if ! git -C "$ROOT" fetch origin "refs/tags/${VERSION}:refs/tags/${VERSION}" \
    && ! git -C "$ROOT" fetch origin "$VERSION"; then
    die "This computer could not download ${VERSION}."
  fi
  git -C "$ROOT" checkout --detach "$VERSION"
fi

room_version="$(git -C "$ROOT" describe --tags --always 2>/dev/null || echo dev)"
export ROOM_VERSION="$room_version"
echo "Building ${room_version}."
compose up -d --build

if ! bash "$ROOT/scripts/check_room.sh"; then
  echo "The new program did not answer. Putting the previous one back."
  if docker image inspect "$PREVIOUS_IMAGE" >/dev/null 2>&1; then
    bash "$ROOT/scripts/rollback_room.sh" || true
  fi
  exit 1
fi

echo "The update is in place. If the wall looks wrong, run:"
echo "  bash scripts/rollback_room.sh"
