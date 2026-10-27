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

WSL_DISTRO_NAME="TestDistro"
expect_wsl "WSL_DISTRO_NAME should count as Windows"
if [[ "$(wsl_distro_name)" != "TestDistro" ]]; then
  fail "the distro name should come from WSL_DISTRO_NAME"
fi
unset WSL_DISTRO_NAME
if wsl_distro_name >/dev/null 2>&1; then
  fail "a missing distro name should stay missing"
fi

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

unc="$(wsl_unc_repo Ubuntu /home/omega)"
if [[ "$unc" != '\\wsl$\Ubuntu\home\omega\kids-galaxy-projector' ]]; then
  fail "windows path was [$unc]"
fi

WSL_DISTRO_NAME="Ubuntu"
WSL_LINUX_USER="omega"
WSL_LINUX_HOME="/home/omega"
lines="$(windows_admin_lines)"
if [[ "$lines" != *'\\wsl$\Ubuntu\home\omega\kids-galaxy-projector\scripts\windows\kids-galaxy-firewall.ps1'* ]]; then
  fail "firewall command was not filled in"
fi
if [[ "$lines" != *'-Distro Ubuntu -User omega'* ]]; then
  fail "sign-in command did not use the detected distro and user"
fi
unset WSL_DISTRO_NAME WSL_LINUX_USER WSL_LINUX_HOME

if grep -q 'DrawPlanet1' "$ROOT/scripts/setup_hotspot.sh" \
  "$ROOT/docs/user/en/install.md" "$ROOT/docs/user/fr/install.md"; then
  fail "a published hotspot password is still in the scripts or the install guide"
fi
banned_distro="$(printf 'Ubuntu-%s' '22.04')"
if grep -R -n "$banned_distro" "$ROOT/scripts" "$ROOT/docs/user" "$ROOT/DEVELOPMENT.md" >/dev/null; then
  fail "the distro name is still hard-coded"
fi
if ! grep -q 'Get-NetConnectionProfile' "$ROOT/scripts/windows/kids-galaxy-firewall.ps1"; then
  fail "the firewall script should check the network profile"
fi
if grep -q 'DefaultInboundAction Block' "$ROOT/scripts/windows/kids-galaxy-firewall.ps1"; then
  fail "removing rules must leave the Hyper-V inbound setting alone"
fi
if ! grep -q 'GetInternetConnectionProfile' "$ROOT/scripts/windows/kids-galaxy-hotspot.ps1"; then
  fail "the hotspot script should notice a missing uplink"
fi
if grep -q 'DrawPlanet1' "$ROOT/scripts/windows/kids-galaxy-hotspot.ps1"; then
  fail "the Windows hotspot script must not ship a password"
fi

DOCKER_DESKTOP_STATE="running"
if [[ "$(docker_desktop_state)" != "running" ]]; then
  fail "Docker Desktop running state was not kept"
fi
DOCKER_DESKTOP_STATE="stopped"
if [[ "$(docker_desktop_state)" != "stopped" ]]; then
  fail "Docker Desktop stopped state was not kept"
fi
DOCKER_DESKTOP_STATE="absent"
if [[ "$(docker_desktop_state)" != "absent" ]]; then
  fail "Docker Desktop absent state was not kept"
fi
unset DOCKER_DESKTOP_STATE

echo "WSL detection checks passed."
