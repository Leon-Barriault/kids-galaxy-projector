#!/usr/bin/env bash
# Prove the room ID cards can be made again, cancelled, and renewed.
# This does not touch the certificates in the repository.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export CERTS_DIR="$tmp/certs"
export SERVER_IP=10.9.8.7
export SERVER_DNS=kids-galaxy.test
export DAYS=90
export RENEW_WITHIN_DAYS=30

bash "$ROOT/scripts/production_certs.sh" init
ca_first="$(sha256sum "$CERTS_DIR/ca.key" | awk '{ print $1 }')"
server_first="$(sha256sum "$CERTS_DIR/server.crt" | awk '{ print $1 }')"
bash "$ROOT/scripts/production_certs.sh" init
ca_second="$(sha256sum "$CERTS_DIR/ca.key" | awk '{ print $1 }')"
server_second="$(sha256sum "$CERTS_DIR/server.crt" | awk '{ print $1 }')"
[[ "$ca_first" == "$ca_second" ]]
[[ "$server_first" == "$server_second" ]]

bash "$ROOT/scripts/production_certs.sh" issue-tablet --role kid --name kid-2
openssl verify -CAfile "$CERTS_DIR/ca.crt" "$CERTS_DIR/tablets/kid-2/client.crt" >/dev/null
openssl verify -CAfile "$CERTS_DIR/ca.crt" -crl_check -CRLfile "$CERTS_DIR/ca.crl" \
  "$CERTS_DIR/tablets/kid-2/client.crt" >/dev/null
kid_key="$(sha256sum "$CERTS_DIR/tablets/kid-2/client.key" | awk '{ print $1 }')"
bash "$ROOT/scripts/production_certs.sh" issue-tablet --role kid --name kid-2
kid_key_again="$(sha256sum "$CERTS_DIR/tablets/kid-2/client.key" | awk '{ print $1 }')"
[[ "$kid_key" == "$kid_key_again" ]]

bash "$ROOT/scripts/production_certs.sh" revoke-tablet --name kid-2
revoked="$(find "$CERTS_DIR/tablets" -path '*.revoked-*' -name client.crt)"
[[ -n "$revoked" ]]
if openssl verify -CAfile "$CERTS_DIR/ca.crt" -crl_check -CRLfile "$CERTS_DIR/ca.crl" "$revoked" >/dev/null
then
  echo "A cancelled tablet card was still accepted." >&2
  exit 1
fi

bash "$ROOT/scripts/production_certs.sh" revoke-tablet --name kid-2

ca_before="$(sha256sum "$CERTS_DIR/ca.key" | awk '{ print $1 }')"
SERVER_IP=10.9.8.8 bash "$ROOT/scripts/production_certs.sh" reissue-server
ca_after="$(sha256sum "$CERTS_DIR/ca.key" | awk '{ print $1 }')"
[[ "$ca_before" == "$ca_after" ]]
openssl x509 -in "$CERTS_DIR/server.crt" -noout -ext subjectAltName | grep -q 'IP Address:10.9.8.8'
openssl x509 -in "$CERTS_DIR/tablets/kid-1/client.crt" -noout -subject | grep -q 'OU = kid'
openssl x509 -in "$CERTS_DIR/tablets/manager-1/client.crt" -noout -subject | grep -q 'OU = manager'

echo "Room ID cards keep the room card, cancel one tablet, and renew the address."
