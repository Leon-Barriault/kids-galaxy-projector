#!/bin/bash
# Generate a small CA + server + role-specific client certificates for mTLS.
#
# Roles are encoded in the client certificate OU and are interpreted only by
# the trusted local TLS gateway:
#   OU=kid      -> drawing tablet, may upload planets
#   OU=manager  -> manager tablet, may inspect/delete/clear
#
# Usage:
#   ./generate_certs.sh
#   SERVER_IP=192.168.1.50 ./generate_certs.sh
#   CLIENT_P12_PASSWORD=<secret> ./generate_certs.sh
#   MANAGER_P12_PASSWORD=<secret> ./generate_certs.sh
#
# Output includes:
#   ca.crt / ca.key
#   server.crt / server.key
#   client.crt / client.key / client.p12      (kid role; legacy names retained)
#   manager.crt / manager.key / manager.p12   (manager role)

set -euo pipefail
cd "$(dirname "$0")"

DAYS="${DAYS:-825}"
SERVER_IP="${SERVER_IP:-10.42.0.1}"
SERVER_DNS="${SERVER_DNS:-kids-galaxy.local}"
CLIENT_P12_PASSWORD="${CLIENT_P12_PASSWORD:-KidsGalaxy}"
MANAGER_P12_PASSWORD="${MANAGER_P12_PASSWORD:-$CLIENT_P12_PASSWORD}"

SUBJ_CA="/CN=KidsGalaxy-CA"
SUBJ_SERVER="/CN=${SERVER_DNS}"
SUBJ_KID="/O=Kids Galaxy/OU=kid/CN=kids-galaxy-tablet"
SUBJ_MANAGER="/O=Kids Galaxy/OU=manager/CN=kids-galaxy-manager"

echo "=== Generating Kids Galaxy mTLS certificates ==="
echo "    server IP  : ${SERVER_IP}"
echo "    server DNS : ${SERVER_DNS}"
echo "    validity   : ${DAYS} days"
echo ""

openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS" \
  -out ca.crt -subj "$SUBJ_CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash"

openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "$SUBJ_SERVER"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days "$DAYS" -sha256 \
  -extfile <(
    cat <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:${SERVER_IP},DNS:${SERVER_DNS},DNS:localhost,IP:127.0.0.1
EOF
  )

issue_client() {
  local prefix="$1"
  local subject="$2"
  local password="$3"

  openssl genrsa -out "${prefix}.key" 2048
  openssl req -new -key "${prefix}.key" -out "${prefix}.csr" -subj "$subject"
  openssl x509 -req -in "${prefix}.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out "${prefix}.crt" -days "$DAYS" -sha256 \
    -extfile <(
      cat <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF
    )
  openssl pkcs12 -export -out "${prefix}.p12" \
    -inkey "${prefix}.key" -in "${prefix}.crt" -certfile ca.crt \
    -passout pass:"$password"
}

# Keep `client.*` for compatibility with the drawing app and existing installs.
issue_client "client" "$SUBJ_KID" "$CLIENT_P12_PASSWORD"
issue_client "manager" "$SUBJ_MANAGER" "$MANAGER_P12_PASSWORD"

rm -f ./*.csr ./ca.srl

echo ""
echo "Certificates generated in $(pwd):"
echo "  ca.crt / ca.key                - Certificate Authority"
echo "  server.crt / server.key        - TLS gateway certificate"
echo "  client.crt / client.p12        - Drawing tablet (OU=kid)"
echo "  manager.crt / manager.p12      - Manager tablet (OU=manager)"
echo ""
echo "Server certificate SANs:"
openssl x509 -in server.crt -noout -ext subjectAltName | sed 's/^/  /'
echo ""
echo "Client roles:"
openssl x509 -in client.crt -noout -subject | sed 's/^/  /'
openssl x509 -in manager.crt -noout -subject | sed 's/^/  /'
echo ""
echo "Copy credentials into Android assets before release builds:"
echo "  mkdir -p ../../android/app/src/main/assets"
echo "  cp client.p12 ca.crt ../../android/app/src/main/assets/"
echo "  mkdir -p ../../android/manager/src/main/assets"
echo "  cp manager.p12 ca.crt ../../android/manager/src/main/assets/"
echo ""
echo "Run the field deployment behind the mTLS gateway, not uvicorn TLS directly."
