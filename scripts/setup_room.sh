#!/usr/bin/env bash
# First start for the galaxy computer (laptop, desktop, or Raspberry Pi).
# Open Terminal in this project folder, then paste:
#   bash scripts/setup_room.sh
#
# Renew the address card when the computer address changes:
#   NEW_CERTIFICATES=1 bash scripts/setup_room.sh
# Tablet ID cards stay valid. Build the apps again so they learn the new address.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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

if [[ -n "${SERVER_IP:-}" ]]; then
  ADDRESS="$SERVER_IP"
else
  ADDRESS="$(lan_ip)"
fi

if [[ -z "$ADDRESS" ]]; then
  echo "This computer has no network address yet."
  echo "Join the room Wi-Fi, or plug in the network cable. Then run this again."
  exit 1
fi

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
echo "The install password is in pi-server/state/room-card.txt on this computer."
echo "Do not email that file. Children never type the password."
echo "Next, show the picture: bash scripts/open_projector.sh"
