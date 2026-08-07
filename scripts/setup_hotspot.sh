#!/bin/bash
# Kids Galaxy Projector - Create Wi-Fi Hotspot with NetworkManager
# Run with: sudo bash setup_hotspot.sh

set -e

SSID="KidsGalaxy"
PASSWORD="DrawPlanet1"
IFACE="wlan0"

echo "=== Kids Galaxy Projector - Hotspot Setup ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)"
  exit 1
fi

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
echo "Connect your tablet to this network and use http://10.42.0.1:8000/"
echo ""
nmcli connection show Hotspot
