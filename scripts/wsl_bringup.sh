#!/usr/bin/env bash
# Start the galaxy program inside Ubuntu on Windows.
# A Windows sign-in task runs this. You can paste it too:
#   bash scripts/wsl_bringup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/wsl.sh
source "$ROOT/scripts/lib/wsl.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/wsl_bringup.sh

Wait until Docker is ready, then start the galaxy program.
Safe to run again. Planets and ID cards stay in place.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 0 ]]; then
  echo "Unknown option: $1" >&2
  echo "Run: bash scripts/wsl_bringup.sh --help" >&2
  exit 1
fi

if ! is_wsl; then
  echo "This start line is for Ubuntu inside Windows."
  echo "On a Linux computer, run: bash scripts/setup_room.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is missing inside Ubuntu."
  echo "Run: bash scripts/setup_host.sh"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  if [[ -d /run/systemd/system ]] && command -v systemctl >/dev/null 2>&1; then
    sudo -n systemctl start docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    sudo -n service docker start >/dev/null 2>&1 || true
  fi
fi

ready=0
for _ in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "Docker is installed, but this user cannot use it yet."
  echo "Run bash scripts/setup_host.sh, close Ubuntu, then open Ubuntu again."
  exit 1
fi

exec bash "$ROOT/scripts/setup_room.sh"
