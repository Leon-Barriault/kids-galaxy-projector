#!/usr/bin/env bash
# Windows Subsystem for Linux helpers.
# Source this file. Do not run it on its own.

WSL_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

is_wsl() {
  if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
    return 0
  fi
  local version_file="${WSL_PROC_VERSION:-/proc/version}"
  if [[ -r "$version_file" ]] && grep -qi microsoft "$version_file"; then
    return 0
  fi
  return 1
}

wsl_nat_looking() {
  local ip="$1"
  case "$ip" in
    172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) return 0 ;;
    *) return 1 ;;
  esac
}

wsl_config_mode() {
  local path="${WSL_CONFIG_FILE:-}"
  if [[ -z "$path" ]]; then
    path="$(wsl_config_path 2>/dev/null || true)"
  fi
  if [[ -n "$path" && -f "$path" ]] && grep -qiE '^[[:space:]]*networkingMode[[:space:]]*=[[:space:]]*mirrored[[:space:]]*$' "$path"; then
    printf 'mirrored'
    return 0
  fi
  printf 'nat'
}

wsl_config_path() {
  if [[ -n "${WSL_CONFIG_FILE:-}" ]]; then
    printf '%s' "$WSL_CONFIG_FILE"
    return 0
  fi
  command -v cmd.exe >/dev/null 2>&1 || return 1
  local profile drive rest
  profile="$(cmd.exe /c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')"
  [[ -n "$profile" ]] || return 1
  drive="$(printf '%s' "$profile" | cut -c1 | tr '[:upper:]' '[:lower:]')"
  rest="${profile:2}"
  rest="${rest//\\//}"
  printf '/mnt/%s%s/.wslconfig' "$drive" "$rest"
}

# Print the address tablets should use, then a status word.
# Status is mirrored, nat, mirrored-pending, need-windows-ip, or none.
choose_tablet_address() {
  local wsl_ip="$1"
  local win_ip="$2"
  local config_mode="$3"

  if [[ "$config_mode" == "mirrored" && -n "$win_ip" && -n "$wsl_ip" && "$wsl_ip" != "$win_ip" ]]; then
    printf '%s\nmirrored-pending\n' "$wsl_ip"
    return 0
  fi
  if [[ -n "$wsl_ip" && -n "$win_ip" && "$wsl_ip" == "$win_ip" ]]; then
    printf '%s\nmirrored\n' "$wsl_ip"
    return 0
  fi
  if [[ "$config_mode" == "mirrored" && -z "$win_ip" ]] && wsl_nat_looking "$wsl_ip"; then
    printf '%s\nmirrored-pending\n' "$wsl_ip"
    return 0
  fi
  if [[ -n "$win_ip" ]]; then
    printf '%s\nnat\n' "$win_ip"
    return 0
  fi
  if [[ -n "$wsl_ip" ]]; then
    printf '%s\nneed-windows-ip\n' "$wsl_ip"
    return 0
  fi
  printf '\nnone\n'
}

windows_lan_ip() {
  local script="${WSL_LIB_DIR}/../windows/kids-galaxy-lan-ip.ps1"
  local win_script ip
  if ! command -v powershell.exe >/dev/null 2>&1; then
    return 1
  fi
  if [[ ! -f "$script" ]]; then
    return 1
  fi
  win_script="$script"
  if command -v wslpath >/dev/null 2>&1; then
    win_script="$(wslpath -w "$script")"
  fi
  ip="$(powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$win_script" 2>/dev/null | tr -d '\r' | awk 'NF { print; exit }' || true)"
  [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  printf '%s' "$ip"
}
