#!/usr/bin/env bash
# Look at the galaxy computer and say what is wrong.
# Paste:
#   bash scripts/check_room.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

usage() {
  cat <<'EOF'
Usage: bash scripts/check_room.sh

Check the galaxy program, the tablet door, the ID cards, disk space,
and whether a safety copy exists. Safe to run any time.
A date warning still counts as a pass. A stopped program does not.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -gt 0 ]]; then
  die "Unknown option: $1. Run: bash scripts/check_room.sh --help"
fi

problems=0

note() {
  echo "$1"
}

if ! command -v docker >/dev/null 2>&1; then
  note "Docker is missing."
  problems=1
elif ! docker info >/dev/null 2>&1; then
  note "Docker is installed, but this user cannot use it."
  problems=1
elif ! compose ps --status running --services 2>/dev/null | grep -qx 'pi-server'; then
  note "The galaxy program is stopped."
  problems=1
else
  note "The galaxy program is running."
fi

ready=0
for _ in $(seq 1 15); do
  if curl -sf "http://127.0.0.1:8000/health" 2>/dev/null | grep -q '"status":"ok"'; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -eq 1 ]]; then
  note "The galaxy program answered ok."
else
  note "The galaxy program did not answer."
  problems=1
fi

if curl -sfk "https://127.0.0.1:8443/health" 2>/dev/null | grep -q '"status":"ok"'; then
  note "The tablet door answered ok."
else
  note "The tablet door did not answer."
  problems=1
fi

if [[ -f "$CERT_DIR/server.crt" ]]; then
  if ! openssl x509 -checkend 0 -noout -in "$CERT_DIR/server.crt" >/dev/null 2>&1; then
    note "The address card is expired."
    problems=1
  elif ! openssl x509 -checkend $((30 * 24 * 3600)) -noout -in "$CERT_DIR/server.crt" >/dev/null 2>&1; then
    note "Look soon. The address card expires within 30 days."
  else
    note "The address card is in date."
  fi
else
  note "The address card is missing."
  problems=1
fi

if [[ -f "$CERT_DIR/ca.crl" ]]; then
  crl_end="$(openssl crl -in "$CERT_DIR/ca.crl" -noout -nextupdate | cut -d= -f2-)"
  crl_epoch="$(date -d "$crl_end" +%s 2>/dev/null || true)"
  now_epoch="$(date +%s)"
  if [[ -z "$crl_epoch" ]]; then
    note "The cancel list date could not be read."
    problems=1
  elif [[ "$crl_epoch" -le "$now_epoch" ]]; then
    note "The cancel list is expired."
    problems=1
  elif [[ $((crl_epoch - now_epoch)) -lt $((30 * 24 * 3600)) ]]; then
    note "Look soon. Refresh the cancel list with: bash scripts/production_certs.sh renew-crl"
  else
    note "The cancel list is in date."
  fi
else
  note "The cancel list is missing."
  problems=1
fi

if [[ -d "$UPLOAD_DIR" ]]; then
  used="$(df -P "$UPLOAD_DIR" | awk 'NR==2 { print $5 }' | tr -d '%')"
  free_space="$(df -hP "$UPLOAD_DIR" | awk 'NR==2 { print $4 }')"
  note "Free space for planets: ${free_space}."
  if [[ "$used" -ge 90 ]]; then
    note "Look soon. The disk is almost full."
  fi
fi

newest="$(find "$BACKUP_DIR" -name 'kids-galaxy-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 || true)"
if [[ -z "$newest" ]]; then
  note "Look soon. There is no safety copy yet."
else
  note "A safety copy is on this computer."
fi

if [[ "$problems" -eq 0 ]]; then
  note "The room check passed."
  exit 0
fi
note "The room check failed."
exit 1
