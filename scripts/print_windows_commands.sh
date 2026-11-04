#!/usr/bin/env bash
# Print the Windows commands for this Ubuntu, with the real paths filled in.
# Paste:
#   bash scripts/print_windows_commands.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/wsl.sh
source "$ROOT/scripts/lib/wsl.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/print_windows_commands.sh

Print the admin PowerShell lines for this Ubuntu.
The distro name comes from WSL_DISTRO_NAME.
The Windows path uses that name and this Linux user.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 0 ]]; then
  echo "Unknown option: $1" >&2
  echo "Run: bash scripts/print_windows_commands.sh --help" >&2
  exit 1
fi

if ! is_wsl; then
  echo "This helper is for Ubuntu inside Windows."
  exit 1
fi

if ! wsl_distro_name >/dev/null; then
  echo "The distro name was not found."
  echo "In Ubuntu, run: echo \"\$WSL_DISTRO_NAME\""
  echo "In Windows PowerShell, run: wsl -l -q"
  exit 1
fi

if [[ "$(wsl_linux_user)" == "root" ]]; then
  echo "Run this from your Ubuntu user, not from root."
  exit 1
fi

if ! windows_admin_lines; then
  echo "The Windows path could not be built."
  exit 1
fi
