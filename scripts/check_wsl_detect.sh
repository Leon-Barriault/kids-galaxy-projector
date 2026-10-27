#!/usr/bin/env bash
# Check Windows-in-Ubuntu detection without a Windows PC.
# Paste:
#   bash scripts/check_wsl_detect.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/wsl.sh
source "$ROOT/scripts/lib/wsl.sh"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

expect_wsl() {
  if ! is_wsl; then
    fail "$1"
  fi
}

expect_not_wsl() {
  if is_wsl; then
    fail "$1"
  fi
}

expect_choice() {
  local got
  got="$(choose_tablet_address "$1" "$2" "$3")"
  local want="$4"$'\n'"$5"
  if [[ "$got" != "$want" ]]; then
    fail "address choice for [$1] [$2] [$3] returned [$got]"
  fi
}

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

WSL_DISTRO_NAME="Ubuntu-22.04"
expect_wsl "WSL_DISTRO_NAME should count as Windows"
unset WSL_DISTRO_NAME

printf 'Linux version 5.15.153.1-microsoft-standard-WSL2\n' >"$tmp"
WSL_PROC_VERSION="$tmp"
expect_wsl "a Microsoft kernel line should count as Windows"

printf 'Linux version 6.12.94+\n' >"$tmp"
expect_not_wsl "a normal Linux kernel line is not Windows"
unset WSL_PROC_VERSION

expect_choice "172.22.10.8" "192.168.1.50" "mirrored" "172.22.10.8" "mirrored-pending"
expect_choice "192.168.1.50" "192.168.1.50" "mirrored" "192.168.1.50" "mirrored"
expect_choice "172.22.10.8" "" "mirrored" "172.22.10.8" "mirrored-pending"
expect_choice "172.22.10.8" "192.168.1.50" "nat" "192.168.1.50" "nat"
expect_choice "172.22.10.8" "" "nat" "172.22.10.8" "need-windows-ip"
expect_choice "" "" "nat" "" "none"

if wsl_nat_looking "192.168.1.50"; then
  fail "a house address is not the private Ubuntu range"
fi
if ! wsl_nat_looking "172.31.255.4"; then
  fail "172.31 is the private Ubuntu range"
fi
if wsl_nat_looking "172.15.0.4"; then
  fail "172.15 is outside the private Ubuntu range"
fi

echo "WSL detection checks passed."
