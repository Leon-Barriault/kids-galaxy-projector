#!/usr/bin/env bash
# Shared helpers for the galaxy-computer scripts.
# Source this file. Do not run it on its own.

if [[ -n "${ROOM_LIB_LOADED:-}" ]]; then
  return 0
fi
ROOM_LIB_LOADED=1

: "${ROOT:?ROOT is not set}"

# Callers read these names. They are the room contract, not local leftovers.
export COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.secure.yml}"
export CERT_DIR="${CERTS_DIR:-$ROOT/pi-server/certs}"
export STATE_DIR="${STATE_DIR:-$ROOT/pi-server/state}"
export UPLOAD_DIR="${UPLOAD_DIR:-$ROOT/pi-server/uploads}"
export IMAGE_NAME="${IMAGE_NAME:-kids-galaxy-pi-server}"
export IMAGE_TAG="${ROOM_IMAGE_TAG:-room}"
export IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"
export PREVIOUS_IMAGE="${IMAGE_NAME}:previous"
export RELEASE_FILE="${STATE_DIR}/room-release.txt"
export BACKUP_DIR="${KIDS_GALAXY_BACKUP_DIR:-$HOME/kids-galaxy-backups}"
export KID_PACKAGE="com.kidsgalaxy"
export KID_ADMIN="${KID_PACKAGE}/.DeviceAdminReceiver"

die() {
  echo "$1" >&2
  exit 1
}

need_cmd() {
  local cmd="$1"
  local message="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "$message"
  fi
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

have_docker() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}
