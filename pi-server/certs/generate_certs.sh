#!/bin/bash
# Generate a small CA + server + client certificates for mTLS.
# Used for passwordless, certificate-based authentication between
# the Android tablet and the FastAPI server.
#
# Usage:
#   ./generate_certs.sh                      # defaults to IP 10.42.0.1
#   SERVER_IP=192.168.1.50 ./generate_certs.sh
#   SERVER_IP=10.42.0.1 SERVER_DNS=kids-galaxy.local ./generate_certs.sh
#   CLIENT_P12_PASSWORD=<secret> ./generate_certs.sh
#
# Output: ca.crt, ca.key, server.crt, server.key, client.crt, client.key, client.p12
#
# IMPORTANT: modern Android/OkHttp ignore the certificate Common Name and require
# a subjectAltName. Because the tablet connects to the Pi by IP address, the
# server certificate must carry an IP SAN or the TLS handshake will fail.

set -euo pipefail
cd "$(dirname "$0")"

DAYS="${DAYS:-825}" # ~2.25 years (max accepted by Apple/Chrome policies)
SERVER_IP="${SERVER_IP:-10.42.0.1}"
SERVER_DNS="${SERVER_DNS:-kids-galaxy.local}"
CLIENT_P12_PASSWORD="${CLIENT_P12_PASSWORD:-KidsGalaxy}"

SUBJ_CA="/CN=KidsGalaxy-CA"
SUBJ_SERVER="/CN=${SERVER_DNS}"
SUBJ_CLIENT="/CN=tablet-client"

echo "=== Generating Kids Galaxy mTLS certificates ==="
echo "    server IP  : ${SERVER_IP}"
echo "    server DNS : ${SERVER_DNS}"
echo "    validity   : ${DAYS} days"
echo ""

# 1. Certificate Authority
#    basicConstraints=CA:TRUE is set explicitly - without it, strict clients
#    refuse to treat this certificate as an issuer.
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days "$DAYS" \
  -out ca.crt -subj "$SUBJ_CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash"

# 2. Server certificate (with SANs - required by Android)
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

# 3. Client certificate (for tablets)
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr -subj "$SUBJ_CLIENT"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days "$DAYS" -sha256 \
  -extfile <(
    cat <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF
  )

# 4. PKCS#12 bundle for easy import on Android
openssl pkcs12 -export -out client.p12 \
  -inkey client.key -in client.crt -certfile ca.crt \
  -passout pass:"$CLIENT_P12_PASSWORD"

# Cleanup
rm -f ./*.csr ./ca.srl

echo ""
echo "Certificates generated in $(pwd):"
echo "  ca.crt / ca.key          - Certificate Authority"
echo "  server.crt / server.key  - Server (FastAPI / uvicorn)"
echo "  client.crt / client.key  - Client (tablet)"
echo "  client.p12               - PKCS#12 for Android"
echo ""
echo "Server certificate SANs:"
openssl x509 -in server.crt -noout -ext subjectAltName | sed 's/^/  /'
echo ""
echo "To run the server with mTLS:"
echo "  uvicorn main:app --host 0.0.0.0 --port 8443 \\"
echo "    --ssl-keyfile certs/server.key \\"
echo "    --ssl-certfile certs/server.crt \\"
echo "    --ssl-ca-certs certs/ca.crt \\"
echo "    --ssl-cert-reqs 2"
echo ""
echo "For the Android app (mTLS release build), copy into app assets:"
echo "  cp client.p12 ca.crt ../../android/app/src/main/assets/"
echo ""
echo "Install client.p12 + ca.crt on each tablet (install-time password only)."
