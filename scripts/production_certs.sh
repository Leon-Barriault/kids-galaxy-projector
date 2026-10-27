#!/usr/bin/env bash
# Room ID cards for the tablets and the galaxy computer.
# Safe to run again. A second run keeps the room card.
#
#   bash scripts/production_certs.sh --help
#   bash scripts/production_certs.sh init
#   bash scripts/production_certs.sh issue-tablet --role kid --name kid-2
#   bash scripts/production_certs.sh revoke-tablet --name kid-2

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=SCRIPTDIR/lib/room.sh
source "$ROOT/scripts/lib/room.sh"

DAYS="${DAYS:-825}"
SERVER_DNS="${SERVER_DNS:-kids-galaxy.local}"
CRL_DAYS="${CRL_DAYS:-800}"
RENEW_WITHIN_DAYS="${RENEW_WITHIN_DAYS:-30}"

usage() {
  cat <<'EOF'
Usage: bash scripts/production_certs.sh <command> [options]

Make and renew the ID cards for one room.
A second run keeps the room card. It does not start over.

Commands:
  init              Make the room card, the address card, and the first tablets.
  reissue-server    Make a new address card. Tablet cards stay valid.
  issue-tablet      Make one tablet card.
  revoke-tablet     Cancel a lost tablet. The wall stops trusting that card.
  use-tablet        Copy one tablet card into the matching app folder.
  list              Show the tablet cards and their dates.
  renew-crl         Refresh the cancel list.
  rotate-ca         Start over. Every tablet must be set up again.

Options:
  --role kid|manager   Used with issue-tablet.
  --name NAME          Short name such as kid-2. Letters, numbers, and dashes.
  --yes                Required with rotate-ca.
  --help               Show this help.

The computer address comes from SERVER_IP. The name kids-galaxy.local is the
default. Set SERVER_DNS to use another name. Cards last 825 days unless DAYS
is set. Passwords stay in pi-server/certs/p12-password on this computer.
EOF
}

valid_name() {
  local name="$1"
  [[ "$name" =~ ^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$ ]]
}

valid_role() {
  local role="$1"
  [[ "$role" == "kid" || "$role" == "manager" ]]
}

read_password() {
  local path="$CERT_DIR/p12-password"
  if [[ -f "$path" ]]; then
    cat "$path"
    return 0
  fi
  local generated="${CLIENT_P12_PASSWORD:-}"
  if [[ -z "$generated" && -f "$CERT_DIR/client.p12" ]]; then
    # Rooms made before this script stored the original install password.
    generated="KidsGalaxy"
    echo "Using the original install password already stored in the tablet cards."
  fi
  if [[ -z "$generated" ]]; then
    generated="$(openssl rand -hex 16)"
  fi
  umask 077
  printf '%s\n' "$generated" >"$path"
  umask 022
  chmod 600 "$path"
  printf '%s\n' "$generated"
}

write_config() {
  local ip="$1"
  local dns="$2"
  local db="$CERT_DIR/ca-db"
  mkdir -p "$db"
  if [[ ! -f "$db/index.txt" ]]; then
    : >"$db/index.txt"
  fi
  if [[ ! -f "$db/index.txt.attr" ]]; then
    echo 'unique_subject = no' >"$db/index.txt.attr"
  fi
  if [[ ! -f "$db/serial" ]]; then
    echo '1000' >"$db/serial"
  fi
  if [[ ! -f "$db/crlnumber" ]]; then
    echo '1000' >"$db/crlnumber"
  fi
  cat >"$db/openssl.cnf" <<EOF
[ ca ]
default_ca = room_ca

[ room_ca ]
dir               = ${db}
database          = \$dir/index.txt
new_certs_dir     = \$dir
certificate       = ${CERT_DIR}/ca.crt
private_key       = ${CERT_DIR}/ca.key
serial            = \$dir/serial
crlnumber         = \$dir/crlnumber
crl_extensions    = crl_ext
default_crl_days  = ${CRL_DAYS}
default_md        = sha256
default_days      = ${DAYS}
policy            = room_policy
unique_subject    = no
copy_extensions   = none

[ room_policy ]
commonName             = supplied
organizationName       = optional
organizationalUnitName = optional

[ crl_ext ]
authorityKeyIdentifier = keyid:always

[ server_ext ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = IP:${ip},DNS:${dns},DNS:localhost,IP:127.0.0.1

[ client_ext ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = clientAuth
EOF
}

ensure_ca() {
  if [[ -f "$CERT_DIR/ca.crt" && -f "$CERT_DIR/ca.key" ]]; then
    echo "The room card is already here. It was left in place."
    return 0
  fi
  echo "Making the room card."
  openssl genrsa -out "$CERT_DIR/ca.key" 4096
  chmod 600 "$CERT_DIR/ca.key"
  openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" -sha256 -days "$DAYS" \
    -out "$CERT_DIR/ca.crt" -subj "/CN=KidsGalaxy-CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash"
  chmod 644 "$CERT_DIR/ca.crt"
}

run_ca() {
  local err
  err="$(mktemp)"
  if ! openssl ca -batch -config "$CERT_DIR/ca-db/openssl.cnf" "$@" >/dev/null 2>"$err"; then
    cat "$err" >&2
    rm -f "$err"
    return 1
  fi
  rm -f "$err"
}

effective_days() {
  local ca_epoch now remain
  ca_epoch="$(date -d "$(openssl x509 -in "$CERT_DIR/ca.crt" -noout -enddate | cut -d= -f2)" +%s)"
  now="$(date +%s)"
  remain="$(( (ca_epoch - now) / 86400 ))"
  if [[ "$remain" -lt 1 ]]; then
    die "The room card is expired. A helper must start over."
  fi
  if [[ "$DAYS" -gt "$remain" ]]; then
    printf '%s\n' "$remain"
    return 0
  fi
  printf '%s\n' "$DAYS"
}

server_is_current() {
  local cert="$CERT_DIR/server.crt"
  local ip="$1"
  local san
  [[ -f "$cert" && -f "$CERT_DIR/server.key" ]] || return 1
  if ! openssl x509 -checkend "$((RENEW_WITHIN_DAYS * 24 * 3600))" -noout -in "$cert" >/dev/null 2>&1; then
    return 1
  fi
  san="$(openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null || true)"
  [[ "$san" == *"IP Address:${ip}"* || "$san" == *"IP:${ip}"* ]]
}

issue_server() {
  local ip="$1"
  local dns="$2"
  write_config "$ip" "$dns"
  if [[ ! -f "$CERT_DIR/server.key" ]]; then
    openssl genrsa -out "$CERT_DIR/server.key" 2048
    chmod 600 "$CERT_DIR/server.key"
  fi
  openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" \
    -subj "/CN=${dns}"
  local days
  days="$(effective_days)"
  run_ca -extensions server_ext -in "$CERT_DIR/server.csr" -out "$CERT_DIR/server.crt" \
    -days "$days" -notext
  chmod 644 "$CERT_DIR/server.crt"
  rm -f "$CERT_DIR/server.csr"
}

ensure_server() {
  local ip="$1"
  local dns="$2"
  local force="${3:-0}"
  if [[ "$force" != "1" ]] && server_is_current "$ip"; then
    echo "The address card already matches ${ip}."
    return 0
  fi
  echo "Making the address card for ${ip}."
  issue_server "$ip" "$dns"
}

tablet_dir() {
  printf '%s/tablets/%s' "$CERT_DIR" "$1"
}

serial_of() {
  openssl x509 -in "$1" -noout -serial | cut -d= -f2 | tr '[:lower:]' '[:upper:]'
}

# Revoked rows add a date column, and awk drops empty columns.
# Match the serial as its own field so a name cannot cancel the wrong card.
revoked_in_index() {
  local serial="$1"
  local index="$CERT_DIR/ca-db/index.txt"
  [[ -f "$index" ]] || return 1
  awk -v serial="$serial" '
    BEGIN { found = 0 }
    {
      if ($1 != "R") next
      for (i = 1; i <= NF; i++) {
        if (toupper($i) == serial) found = 1
      }
    }
    END { exit found ? 0 : 1 }
  ' "$index"
}

issue_tablet() {
  local role="$1"
  local name="$2"
  local password="$3"
  local ip="${4:-127.0.0.1}"
  local dns="${5:-$SERVER_DNS}"
  local dir cert
  valid_role "$role" || die "The role must be kid or manager."
  valid_name "$name" || die "Use a short name such as kid-2."
  dir="$(tablet_dir "$name")"
  cert="$dir/client.crt"
  if [[ -f "$cert" ]]; then
    local serial
    serial="$(serial_of "$cert")"
    if revoked_in_index "$serial"; then
      local retired
      retired="${dir}.revoked-$(date +%Y%m%d%H%M%S)"
      mv "$dir" "$retired"
      echo "The old card for ${name} was already cancelled."
    elif openssl verify -CAfile "$CERT_DIR/ca.crt" "$cert" >/dev/null 2>&1; then
      echo "The card for ${name} is already here."
      return 0
    fi
  fi
  mkdir -p "$dir"
  write_config "$ip" "$dns"
  echo "Making a ${role} card named ${name}."
  openssl genrsa -out "$dir/client.key" 2048
  chmod 600 "$dir/client.key"
  openssl req -new -key "$dir/client.key" -out "$dir/client.csr" \
    -subj "/O=Kids Galaxy/OU=${role}/CN=${name}"
  local days
  days="$(effective_days)"
  run_ca -extensions client_ext -in "$dir/client.csr" -out "$dir/client.crt" \
    -days "$days" -notext
  chmod 644 "$dir/client.crt"
  openssl pkcs12 -export -out "$dir/client.p12" \
    -inkey "$dir/client.key" -in "$dir/client.crt" -certfile "$CERT_DIR/ca.crt" \
    -passout "pass:${password}"
  chmod 600 "$dir/client.p12"
  printf '%s\n' "$role" >"$dir/role.txt"
  rm -f "$dir/client.csr"
  echo "The card for ${name} is ready."
}

copy_legacy() {
  local name="$1"
  local legacy="$2"
  local dir
  dir="$(tablet_dir "$name")"
  [[ -f "$dir/client.p12" ]] || return 0
  cp "$dir/client.p12" "$CERT_DIR/${legacy}.p12"
  cp "$dir/client.crt" "$CERT_DIR/${legacy}.crt"
  cp "$dir/client.key" "$CERT_DIR/${legacy}.key"
  chmod 600 "$CERT_DIR/${legacy}.p12" "$CERT_DIR/${legacy}.key"
}

ensure_default_tablets() {
  local password="$1"
  local ip="$2"
  local dns="$3"
  issue_tablet "kid" "kid-1" "$password" "$ip" "$dns"
  issue_tablet "manager" "manager-1" "$password" "$ip" "$dns"
  if [[ ! -f "$CERT_DIR/client.p12" ]]; then
    copy_legacy "kid-1" "client"
  fi
  if [[ ! -f "$CERT_DIR/manager.p12" ]]; then
    copy_legacy "manager-1" "manager"
  fi
}

renew_crl() {
  [[ -f "$CERT_DIR/ca.crt" && -f "$CERT_DIR/ca.key" ]] || die "The room card is missing. Run init first."
  write_config "${SERVER_IP:-127.0.0.1}" "$SERVER_DNS"
  run_ca -gencrl -out "$CERT_DIR/ca.crl"
  chmod 644 "$CERT_DIR/ca.crl"
  echo "The cancel list is up to date."
}

reload_gateway() {
  if ! have_docker; then
    echo "The galaxy program is not running. The cancel list is saved for the next start."
    return 0
  fi
  if compose ps --status running --services 2>/dev/null | grep -qx 'mtls-gateway'; then
    if ! compose exec -T mtls-gateway nginx -s reload; then
      compose restart mtls-gateway
    fi
    echo "The tablet door is using the new cancel list."
  else
    echo "The tablet door is stopped. The cancel list is saved for the next start."
  fi
}

use_tablet() {
  local name="$1"
  local dir role assets_dir asset_name
  valid_name "$name" || die "Use a short name such as kid-2."
  dir="$(tablet_dir "$name")"
  [[ -f "$dir/client.p12" && -f "$dir/role.txt" ]] || die "No card named ${name}. Make one first."
  role="$(tr -d '[:space:]' <"$dir/role.txt")"
  valid_role "$role" || die "The card named ${name} has no role."
  if [[ "$role" == "kid" ]]; then
    copy_legacy "$name" "client"
    assets_dir="$ROOT/android/app/src/main/assets"
    asset_name="client.p12"
  else
    copy_legacy "$name" "manager"
    assets_dir="$ROOT/android/manager/src/main/assets"
    asset_name="manager.p12"
  fi
  mkdir -p "$assets_dir"
  cp "$dir/client.p12" "$assets_dir/$asset_name"
  cp "$CERT_DIR/ca.crt" "$assets_dir/ca.crt"
  chmod 600 "$assets_dir/$asset_name"
  echo "The ${role} app will use the card named ${name}."
}

require_ip() {
  if [[ -n "${SERVER_IP:-}" ]]; then
    printf '%s\n' "$SERVER_IP"
    return 0
  fi
  local detected=""
  detected="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{
    for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }
  }')" || true
  if [[ -z "$detected" ]]; then
    die "This computer has no address yet. Join the room Wi-Fi, then run this again."
  fi
  printf '%s\n' "$detected"
}

cmd_init() {
  local force_server="${1:-0}"
  local ip password
  need_cmd openssl "OpenSSL is missing. Install it, then run this again."
  mkdir -p "$CERT_DIR"
  ip="$(require_ip)"
  password="$(read_password)"
  ensure_ca
  ensure_server "$ip" "$SERVER_DNS" "$force_server"
  ensure_default_tablets "$password" "$ip" "$SERVER_DNS"
  renew_crl
  echo "ID cards are ready for ${ip}."
  echo "The password file stays on this computer. Do not email it."
}

cmd_list() {
  local dir name role cert end
  [[ -d "$CERT_DIR/tablets" ]] || die "No tablet cards yet. Run init first."
  echo "Tablet cards:"
  shopt -s nullglob
  for dir in "$CERT_DIR"/tablets/*; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    [[ "$name" == *.revoked-* ]] && continue
    role="unknown"
    [[ -f "$dir/role.txt" ]] && role="$(tr -d '[:space:]' <"$dir/role.txt")"
    cert="$dir/client.crt"
    if [[ ! -f "$cert" ]]; then
      echo "  ${name}  ${role}  missing"
      continue
    fi
    end="$(openssl x509 -in "$cert" -noout -enddate | cut -d= -f2)"
    if revoked_in_index "$(serial_of "$cert")"; then
      echo "  ${name}  ${role}  cancelled"
    else
      echo "  ${name}  ${role}  good until ${end}"
    fi
  done
  shopt -u nullglob
  if [[ -f "$CERT_DIR/server.crt" ]]; then
    end="$(openssl x509 -in "$CERT_DIR/server.crt" -noout -enddate | cut -d= -f2)"
    echo "Address card good until ${end}"
  fi
}

cmd_revoke() {
  local name="$1"
  local dir cert serial
  valid_name "$name" || die "Use a short name such as kid-2."
  dir="$(tablet_dir "$name")"
  cert="$dir/client.crt"
  if [[ ! -f "$cert" ]]; then
    local -a retired_cert
    shopt -s nullglob
    retired_cert=("$CERT_DIR/tablets/${name}.revoked-"*/client.crt)
    shopt -u nullglob
    if [[ ${#retired_cert[@]} -gt 0 ]]; then
      echo "The card for ${name} is already cancelled."
      renew_crl
      reload_gateway
      return 0
    fi
    die "No card named ${name}."
  fi
  serial="$(serial_of "$cert")"
  if revoked_in_index "$serial"; then
    echo "The card for ${name} is already cancelled."
    renew_crl
    reload_gateway
    return 0
  fi
  write_config "${SERVER_IP:-127.0.0.1}" "$SERVER_DNS"
  run_ca -revoke "$cert" -crl_reason keyCompromise
  renew_crl
  local retired
  retired="${dir}.revoked-$(date +%Y%m%d%H%M%S)"
  mv "$dir" "$retired"
  echo "The card for ${name} is cancelled."
  echo "Build the app again before that tablet is used."
  reload_gateway
}

COMMAND=""
ROLE=""
NAME=""
YES=0
FORCE_SERVER=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --role)
      [[ $# -ge 2 ]] || die "Add kid or manager after --role."
      ROLE="$2"
      shift 2
      ;;
    --name)
      [[ $# -ge 2 ]] || die "Add a short name after --name."
      NAME="$2"
      shift 2
      ;;
    --yes)
      YES=1
      shift
      ;;
    --force-server)
      FORCE_SERVER=1
      shift
      ;;
    init|reissue-server|issue-tablet|revoke-tablet|use-tablet|list|renew-crl|rotate-ca)
      [[ -z "$COMMAND" ]] || die "Use one command at a time."
      COMMAND="$1"
      shift
      ;;
    *)
      die "Unknown option: $1. Run: bash scripts/production_certs.sh --help"
      ;;
  esac
done

[[ -n "$COMMAND" ]] || die "Add a command. Run: bash scripts/production_certs.sh --help"

case "$COMMAND" in
  init)
    cmd_init "$FORCE_SERVER"
    ;;
  reissue-server)
    need_cmd openssl "OpenSSL is missing. Install it, then run this again."
    [[ -f "$CERT_DIR/ca.key" ]] || die "The room card is missing. Run init first."
    ip="$(require_ip)"
    ensure_server "$ip" "$SERVER_DNS" 1
    renew_crl
    echo "The address card now uses ${ip}. Tablet cards were kept."
    ;;
  issue-tablet)
    [[ -n "$ROLE" && -n "$NAME" ]] || die "Add --role kid or --role manager, and --name."
    [[ -f "$CERT_DIR/ca.key" ]] || die "The room card is missing. Run init first."
    ip="$(require_ip)"
    issue_tablet "$ROLE" "$NAME" "$(read_password)" "$ip" "$SERVER_DNS"
    renew_crl
    ;;
  revoke-tablet)
    [[ -n "$NAME" ]] || die "Add --name for the lost tablet."
    cmd_revoke "$NAME"
    ;;
  use-tablet)
    [[ -n "$NAME" ]] || die "Add --name for the tablet card to copy."
    use_tablet "$NAME"
    ;;
  list)
    cmd_list
    ;;
  renew-crl)
    renew_crl
    reload_gateway
    ;;
  rotate-ca)
    [[ "$YES" -eq 1 ]] || die "This starts over. Run it again with --yes if every tablet is in your hand."
    rm -rf "$CERT_DIR/ca-db" "$CERT_DIR/tablets"
    rm -f "$CERT_DIR"/ca.crt "$CERT_DIR"/ca.key "$CERT_DIR"/ca.crl \
      "$CERT_DIR"/ca.srl "$CERT_DIR"/server.crt "$CERT_DIR"/server.key \
      "$CERT_DIR"/client.crt "$CERT_DIR"/client.key "$CERT_DIR"/client.p12 \
      "$CERT_DIR"/manager.crt "$CERT_DIR"/manager.key "$CERT_DIR"/manager.p12 \
      "$CERT_DIR"/p12-password
    echo "The old room card is gone."
    cmd_init 1
    ;;
esac
