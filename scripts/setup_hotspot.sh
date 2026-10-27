#!/bin/bash
# Kids Galaxy Projector - Create Wi-Fi Hotspot with NetworkManager
# Run with: sudo bash setup_hotspot.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/wsl.sh
source "$ROOT/scripts/lib/wsl.sh"
if is_wsl; then
  echo "This Ubuntu is inside Windows."
  echo "Ubuntu cannot own the Wi-Fi card, so this hotspot does not carry over."
  echo "Use the travel router. It keeps one address with no venue Wi-Fi."
  echo "The Windows hotspot is only a spare, and it wants a connection to share."
  exit 1
fi

SSID="KidsGalaxy"
IFACE="wlan0"
PASSWORD_FILE="/etc/kids-galaxy-hotspot-password"

echo "=== Kids Galaxy Projector - Hotspot Setup ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

PASSWORD="${HOTSPOT_PASSWORD:-}"
if [[ -z "$PASSWORD" && -f "$PASSWORD_FILE" ]]; then
  PASSWORD="$(tr -d '[:space:]' <"$PASSWORD_FILE")"
fi
if [[ -z "$PASSWORD" ]]; then
  PASSWORD="$(openssl rand -hex 12)"
fi

install -m 600 /dev/null "$PASSWORD_FILE"
printf '%s\n' "$PASSWORD" >"$PASSWORD_FILE"
chmod 600 "$PASSWORD_FILE"

# Update
apt update && apt full-upgrade -y

# Ensure NetworkManager is active
systemctl enable NetworkManager
systemctl start NetworkManager

# Create / update hotspot
nmcli connection delete Hotspot 2>/dev/null || true

nmcli device wifi hotspot ifname "$IFACE" ssid "$SSID" password "$PASSWORD"

# Make it persistent
nmcli connection modify Hotspot connection.autoconnect yes

echo ""
echo "Hotspot created successfully!"
echo "  SSID     : $SSID"
echo "  Password : $PASSWORD"
echo "  IP       : usually 10.42.0.1"
echo ""
echo "Write this password on the paper card. It is not printed in the guide."
echo "Connect your tablet to this network and use http://10.42.0.1:8000/"
echo ""
nmcli connection show Hotspot
