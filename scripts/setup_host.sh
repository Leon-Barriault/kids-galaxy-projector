#!/usr/bin/env bash
# Install the programs the galaxy computer needs.
# Paste:
#   bash scripts/setup_host.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: bash scripts/setup_host.sh

Install Docker, OpenSSL, curl, git, and the tablet tool on this computer.
Safe to run again. It does not remove planets or ID cards.
After the first run, log out and log back in so Docker can be used.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 0 ]]; then
  echo "Unknown option: $1" >&2
  echo "Run: bash scripts/setup_host.sh --help" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This command is for the Linux galaxy computer."
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  exec sudo bash "$ROOT/scripts/setup_host.sh"
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 openssl curl ca-certificates git adb

target_user="${SUDO_USER:-}"
if [[ -n "$target_user" && "$target_user" != "root" ]]; then
  usermod -aG docker "$target_user"
  echo "Docker was allowed for ${target_user}."
  echo "Log out and log back in before the next step."
fi

echo "The galaxy computer programs are installed."
echo "Next: bash scripts/setup_room.sh"
