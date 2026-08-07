#!/bin/bash
# Generate a small CA + server + client certificates for mTLS.
# Used for passwordless, certificate-based authentication between
# the Android tablet and the FastAPI server.
#
# Usage: ./generate_certs.sh
# Output: ca.crt, ca.key, server.crt, server.key, client.crt, client.key, client.p12

set -e
cd "$(dirname "$0")"

DAYS=825   # ~2.25 years
SUBJ_CA="/CN=KidsGalaxy-CA"
SUBJ_SERVER="/CN=kids-galaxy.local"
SUBJ_CLIENT="/CN=tablet-client"

echo "=== Generating Kids Galaxy mTLS certificates ==="

# 1. Certificate Authority
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days $DAYS \
  -out ca.crt -subj "$SUBJ_CA"

# 2. Server certificate
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "$SUBJ_SERVER"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days $DAYS -sha256

# 3. Client certificate (for tablets)
openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr -subj "$SUBJ_CLIENT"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days $DAYS -sha256

# 4. PKCS#12 bundle for easy import on Android
openssl pkcs12 -export -out client.p12 \
  -inkey client.key -in client.crt -certfile ca.crt \
  -passout pass:KidsGalaxy

# Cleanup
rm -f ./*.csr ./ca.srl

echo ""
echo "Certificates generated in $(pwd):"
echo "  ca.crt / ca.key          – Certificate Authority"
echo "  server.crt / server.key  – Server (FastAPI / uvicorn)"
echo "  client.crt / client.key  – Client (tablet)"
echo "  client.p12               – PKCS#12 for Android (password: KidsGalaxy)"
echo ""
echo "To run the server with mTLS:"
echo "  uvicorn main:app --host 0.0.0.0 --port 8443 \\"
echo "    --ssl-keyfile certs/server.key \\"
echo "    --ssl-certfile certs/server.crt \\"
echo "    --ssl-ca-certs certs/ca.crt \\"
echo "    --ssl-cert-reqs 2"
echo ""
echo "Install client.p12 + ca.crt on each tablet (install-time password only)."
