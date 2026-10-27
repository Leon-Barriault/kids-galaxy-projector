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

wsl_distro_name() {
  if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
    printf '%s' "$WSL_DISTRO_NAME"
    return 0
  fi
  if [[ -n "${KIDS_WSL_DISTRO:-}" ]]; then
    printf '%s' "$KIDS_WSL_DISTRO"
    return 0
  fi
  return 1
}

wsl_linux_user() {
  if [[ -n "${WSL_LINUX_USER:-}" ]]; then
    printf '%s' "$WSL_LINUX_USER"
    return 0
  fi
  if [[ -n "${KIDS_WSL_USER:-}" && "${KIDS_WSL_USER}" != "root" ]]; then
    printf '%s' "$KIDS_WSL_USER"
    return 0
  fi
  if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    printf '%s' "$SUDO_USER"
    return 0
  fi
  if [[ -n "${USER:-}" && "${USER}" != "root" ]]; then
    printf '%s' "$USER"
    return 0
  fi
  id -un
}

wsl_home_path() {
  if [[ -n "${WSL_LINUX_HOME:-}" ]]; then
    printf '%s' "$WSL_LINUX_HOME"
    return 0
  fi
  local user home
  user="$(wsl_linux_user)"
  home="$(getent passwd "$user" 2>/dev/null | cut -d: -f6)"
  [[ -n "$home" ]] || return 1
  printf '%s' "$home"
}

# \\wsl$\<distro>\<home>\kids-galaxy-projector
wsl_unc_repo() {
  local distro="$1"
  local home_path="$2"
  local repo_name="${3:-kids-galaxy-projector}"
  local rel="${home_path#/}"
  rel="${rel//\//\\}"
  printf '\\\\wsl$\\%s\\%s\\%s' "$distro" "$rel" "$repo_name"
}

kids_powershell() {
  if [[ -n "${KIDS_POWERSHELL:-}" && -x "${KIDS_POWERSHELL}" ]]; then
    printf '%s' "$KIDS_POWERSHELL"
    return 0
  fi
  if command -v powershell.exe >/dev/null 2>&1; then
    command -v powershell.exe
    return 0
  fi
  local candidate="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
  if [[ -x "$candidate" ]]; then
    printf '%s' "$candidate"
    return 0
  fi
  return 1
}

# running, stopped, or absent. DOCKER_DESKTOP_STATE skips Windows.
docker_desktop_state() {
  if [[ -n "${DOCKER_DESKTOP_STATE:-}" ]]; then
    case "$DOCKER_DESKTOP_STATE" in
      running|stopped|absent) printf '%s' "$DOCKER_DESKTOP_STATE" ;;
      *) printf 'absent' ;;
    esac
    return 0
  fi
  local exe="/mnt/c/Program Files/Docker/Docker/Docker Desktop.exe"
  local installed=0
  local ps running
  [[ -f "$exe" ]] && installed=1
  ps="$(kids_powershell || true)"
  if [[ -n "$ps" ]]; then
    running="$("$ps" -NoProfile -Command 'if (Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue) { "running" } else { "stopped" }' 2>/dev/null | tr -d '\r' | awk 'NF { print; exit }' || true)"
    if [[ "$running" == "running" ]]; then
      printf 'running'
      return 0
    fi
    if [[ "$installed" -eq 1 ]]; then
      printf 'stopped'
      return 0
    fi
  elif [[ "$installed" -eq 1 ]]; then
    printf 'stopped'
    return 0
  fi
  printf 'absent'
}

windows_admin_lines() {
  local distro user home unc base
  distro="$(wsl_distro_name)" || return 1
  user="$(wsl_linux_user)"
  home="$(wsl_home_path)" || return 1
  unc="$(wsl_unc_repo "$distro" "$home")"
  base="${unc}\\scripts\\windows"
  cat <<EOF
Distro: ${distro}
User: ${user}
Windows folder: ${unc}

Open PowerShell as administrator. Paste one line at a time.

Firewall:
powershell -NoProfile -ExecutionPolicy Bypass -File "${base}\\kids-galaxy-firewall.ps1"

Sign-in task:
powershell -NoProfile -ExecutionPolicy Bypass -File "${base}\\kids-galaxy-autostart.ps1" -Distro ${distro} -User ${user}

Port forward, only when mirrored mode is off:
powershell -NoProfile -ExecutionPolicy Bypass -File "${base}\\kids-galaxy-portproxy.ps1" -Distro ${distro} -User ${user}

Hotspot plan, without starting it:
powershell -NoProfile -ExecutionPolicy Bypass -File "${base}\\kids-galaxy-hotspot.ps1" -WhatIf

Check the distro name in PowerShell:
wsl -l -q
EOF
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
