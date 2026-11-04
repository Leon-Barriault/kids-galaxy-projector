#!/usr/bin/env bash
# First start for the galaxy computer (laptop, desktop, or Raspberry Pi).
# Open Terminal in this project folder, then paste:
#   bash scripts/setup_room.sh
#
# The tablets keep one saved address. The default is 192.168.0.52.
# Setup stops when this computer is somewhere else.
# To move the room on purpose, then build the apps again:
#   CHANGE_ADDRESS=1 SERVER_IP=192.168.0.52 bash scripts/setup_room.sh
# NEW_CERTIFICATES=1 renews the card for that same saved address.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/wsl.sh
source "$ROOT/scripts/lib/wsl.sh"
# shellcheck source=SCRIPTDIR/lib/room_address.sh
source "$ROOT/scripts/lib/room_address.sh"
cd "$ROOT"

room_status=""

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This command is for the Linux galaxy computer."
  echo "On a Mac or a Windows PC, ask a helper."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is missing. It runs the galaxy program."
  echo "Type this, wait until it finishes, then run the setup command again:"
  echo "  sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2"
  echo "  sudo usermod -aG docker \"\$USER\""
  echo "Then log out and log in again."
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL is missing. It makes the tablet ID cards."
  echo "Type this, then run the setup command again:"
  echo "  sudo apt-get update && sudo apt-get install -y openssl"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed, but this user cannot use it."
  echo "Type this, then log out and log in again:"
  echo "  sudo usermod -aG docker \"\$USER\""
  exit 1
fi

lan_ip() {
  local ip=""
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{
    for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }
  }')" || true
  if [[ -z "$ip" ]]; then
    ip="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
  fi
  printf '%s' "$ip"
}

EXPLICIT=""
CURRENT=""
if [[ "${CHANGE_ADDRESS:-}" == "1" ]]; then
  if [[ -z "${SERVER_IP:-}" ]]; then
    echo "Type the new address in the command."
    echo "Example: CHANGE_ADDRESS=1 SERVER_IP=${DEFAULT_TABLET_ADDRESS} bash scripts/setup_room.sh"
    exit 1
  fi
  EXPLICIT="$SERVER_IP"
fi

if [[ -z "$EXPLICIT" && -n "${SERVER_IP:-}" ]]; then
  CURRENT="$SERVER_IP"
else
  CURRENT="$(lan_ip)"
  if [[ -z "$EXPLICIT" ]] && is_wsl; then
    win_ip="$(windows_lan_ip || true)"
    mode="$(wsl_config_mode)"
    choice="$(choose_tablet_address "$CURRENT" "$win_ip" "$mode")"
    CURRENT="$(printf '%s\n' "$choice" | sed -n '1p')"
    room_status="$(printf '%s\n' "$choice" | sed -n '2p')"
    case "$room_status" in
      mirrored-pending)
        echo "The Windows file asks for mirrored networking."
        echo "Ubuntu still has a private address."
        echo "In Windows PowerShell, run: wsl --shutdown"
        echo "Open Ubuntu again. Then run this setup again."
        exit 1
        ;;
      need-windows-ip)
        echo "Ubuntu is inside Windows, and the house address was not found."
        echo "In Windows PowerShell, run: ipconfig"
        echo "Then run: SERVER_IP=that.address bash scripts/setup_room.sh"
        echo "The tablets stay on ${DEFAULT_TABLET_ADDRESS} unless you ask to change it."
        exit 1
        ;;
    esac
  fi
fi

SAVED=""
if [[ -f pi-server/state/room-card.txt ]]; then
  SAVED="$(awk -F= '/^ADDRESS=/{ print $2; exit }' pi-server/state/room-card.txt)"
fi
decision="$(decide_room_address "$SAVED" "$CURRENT" "$EXPLICIT")"
ADDRESS="$(printf '%s\n' "$decision" | sed -n '1p')"
address_status="$(printf '%s\n' "$decision" | sed -n '2p')"

case "$address_status" in
  need-current)
    echo "This computer has no network address yet."
    echo "Join the room Wi-Fi, or plug in the network cable. Then run this again."
    exit 1
    ;;
  blocked)
    echo "The tablets use ${ADDRESS}."
    echo "This computer is at ${CURRENT}."
    echo "Join the KidsGalaxy router so this computer is at ${ADDRESS}."
    echo "Then run this setup again."
    echo "To move the room on purpose, run:"
    echo "  CHANGE_ADDRESS=1 SERVER_IP=the.new.address bash scripts/setup_room.sh"
    echo "Then build the tablet apps again."
    exit 1
    ;;
  change)
    if [[ -n "$SAVED" && "$SAVED" != "$ADDRESS" ]]; then
      echo "The room address will change from ${SAVED} to ${ADDRESS}."
      echo "Build the tablet apps again after this setup."
    fi
    ;;
  keep)
    ;;
  *)
    echo "The room address could not be chosen."
    exit 1
    ;;
esac

case "$room_status" in
  nat)
    echo "Windows is sharing Ubuntu with a private network."
    echo "Tablets will use ${ADDRESS}."
    echo "After this setup, run the forward script in an admin PowerShell window."
    ;;
  mirrored)
    echo "Windows mirrored networking is on."
    echo "Tablets will use ${ADDRESS}."
    echo "Run the firewall script in an admin PowerShell window if you have not yet."
    ;;
esac

export SERVER_IP="$ADDRESS"
export SERVER_DNS="${SERVER_DNS:-kids-galaxy.local}"

mkdir -p pi-server/state android/app/src/main/assets android/manager/src/main/assets

if [[ "${NEW_CERTIFICATES:-}" == "1" ]]; then
  echo "Renewing the address card for ${ADDRESS}."
  bash scripts/production_certs.sh init --force-server
else
  bash scripts/production_certs.sh init
fi

PASSWORD="$(tr -d '[:space:]' < pi-server/certs/p12-password)"
export CLIENT_P12_PASSWORD="$PASSWORD"
export MANAGER_P12_PASSWORD="${MANAGER_P12_PASSWORD:-$PASSWORD}"

cp pi-server/certs/client.p12 pi-server/certs/ca.crt android/app/src/main/assets/
cp pi-server/certs/manager.p12 pi-server/certs/ca.crt android/manager/src/main/assets/

umask 077
cat > pi-server/state/room-card.txt <<EOF
ADDRESS=${ADDRESS}
PASSWORD=${PASSWORD}
PROJECTOR_URL=http://127.0.0.1:8000/
TABLET_URL=https://${ADDRESS}:8443
EOF
umask 022

echo "Starting the galaxy program. The first time can take several minutes."
docker compose -f docker-compose.secure.yml up -d --build

ready=0
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:8000/health" | grep -q '"status":"ok"'; then
    ready=1
    break
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  echo "The galaxy program did not wake up."
  echo "Read the install guide section If this does not work."
  docker compose -f docker-compose.secure.yml ps || true
  exit 1
fi

echo ""
echo "The galaxy computer is running."
echo "On this computer, open Chrome and go to:"
echo "  http://127.0.0.1:8000/"
echo "Tablets use this address after the apps are installed:"
echo "  https://${ADDRESS}:8443"
echo "Write ${ADDRESS} on the quick-start card."
if [[ "$room_status" == "nat" ]]; then
  echo "This Windows PC still uses NAT mode."
  echo "Run scripts/windows/kids-galaxy-portproxy.ps1 so tablets can reach port 8443."
fi
if [[ -n "$room_status" ]]; then
  echo "On Windows, the wall page is still http://127.0.0.1:8000/"
fi
echo "The install password is in pi-server/state/room-card.txt on this computer."
echo "Do not email that file. Children never type the password."
echo "Next, show the picture: bash scripts/open_projector.sh"
