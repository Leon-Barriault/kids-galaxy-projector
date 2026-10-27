#!/usr/bin/env bash
# Install the programs the galaxy computer needs.
# Paste:
#   bash scripts/setup_host.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/wsl.sh
source "$ROOT/scripts/lib/wsl.sh"

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
fi

if [[ -d /run/systemd/system ]] && command -v systemctl >/dev/null 2>&1; then
  systemctl enable docker
  systemctl start docker
  echo "Docker will start with Ubuntu."
elif command -v service >/dev/null 2>&1; then
  service docker start || true
fi

echo "The galaxy computer programs are installed."
if is_wsl; then
  echo "This Ubuntu is inside Windows. Docker Desktop is not used."
  echo "Close the Ubuntu window and open it again before the next step."
  echo "Do not run the hotspot script. Use the home router Wi-Fi."
  if [[ ! -d /run/systemd/system ]]; then
    echo "systemd is not running yet."
    echo "Add these lines to /etc/wsl.conf if they are missing:"
    echo "  [boot]"
    echo "  systemd=true"
    echo "Then in Windows PowerShell run: wsl --shutdown"
    echo "Open Ubuntu and run this host line again."
  fi
else
  echo "Log out and log back in before the next step."
fi
echo "Next: bash scripts/setup_room.sh"
