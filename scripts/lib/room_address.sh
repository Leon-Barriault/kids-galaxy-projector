#!/usr/bin/env bash
# Choose the address tablets keep. Source this file. Do not run it on its own.

DEFAULT_TABLET_ADDRESS="192.168.0.52"

# Print the address to keep, then a status word.
# Status is keep, change, blocked, or need-current.
# The third argument is set only when the user asked to change the address.
decide_room_address() {
  local saved="${1:-}"
  local current="${2:-}"
  local explicit="${3:-}"
  local wanted="$DEFAULT_TABLET_ADDRESS"
  if [[ -n "$saved" ]]; then
    wanted="$saved"
  fi
  if [[ -n "$explicit" ]]; then
    printf '%s\nchange\n' "$explicit"
    return 0
  fi
  if [[ -z "$current" ]]; then
    printf '%s\nneed-current\n' "$wanted"
    return 0
  fi
  if [[ "$current" == "$wanted" ]]; then
    printf '%s\nkeep\n' "$wanted"
    return 0
  fi
  printf '%s\nblocked\n' "$wanted"
}
