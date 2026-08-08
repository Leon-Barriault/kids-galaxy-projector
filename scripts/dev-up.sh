#!/usr/bin/env bash
#
# dev-up.sh - bring the whole local debugging environment up in one step.
#
# Android Studio runs this automatically as a "before launch" step of the
# "App (local debug)" configuration, so pressing Debug is genuinely all that is
# needed. It is also runnable directly:
#
#     cd android && ./gradlew devUp
#     scripts/dev-up.sh                 # from the repository root
#
# In order:
#   1. build and start the pi-server container, detached
#   2. block until GET /health answers, so the app never launches against a
#      server that is still starting - that failure looks like a broken app
#   3. start an emulator if no device is attached, and wait for it to boot
#
# Every step is idempotent. Running it twice is a no-op that re-checks health.
#
# Environment overrides:
#   KG_HEALTH_URL        default http://localhost:8000/health
#   KG_SERVER_TIMEOUT    seconds to wait for the server, default 300
#   KG_EMULATOR_TIMEOUT  seconds to wait for the emulator, default 300
#   KG_AVD               AVD to start; default is the first one listed
#   KG_SKIP_EMULATOR=1   leave devices alone (physical tablet on USB)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

HEALTH_URL="${KG_HEALTH_URL:-http://localhost:8000/health}"
SERVER_TIMEOUT="${KG_SERVER_TIMEOUT:-300}"
EMULATOR_TIMEOUT="${KG_EMULATOR_TIMEOUT:-300}"

log() { printf '\033[36m[dev-up]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[dev-up]\033[0m %s\n' "$*" >&2; }
die() {
    printf '\033[31m[dev-up]\033[0m %s\n' "$*" >&2
    exit 1
}

# --------------------------------------------------------------- server -----

compose() {
    if docker compose version >/dev/null 2>&1; then
        docker compose "$@"
    else
        docker-compose "$@"
    fi
}

command -v docker >/dev/null 2>&1 ||
    die "docker not found on PATH. Install Docker Desktop, or run the server by hand: cd pi-server && uvicorn main:app --reload"

docker info >/dev/null 2>&1 ||
    die "The Docker daemon is not responding. Start Docker Desktop and try again."

log "Building and starting pi-server..."
compose up -d --build pi-server

log "Waiting for ${HEALTH_URL} ..."
deadline=$((SECONDS + SERVER_TIMEOUT))
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
        warn "Last 40 lines of the container log:"
        compose logs --tail 40 pi-server >&2 || true
        die "Server did not become healthy within ${SERVER_TIMEOUT}s."
    fi
    sleep 2
done
log "Server is healthy."

# ------------------------------------------------------------- emulator -----

if [ "${KG_SKIP_EMULATOR:-0}" = "1" ]; then
    log "KG_SKIP_EMULATOR=1 - leaving devices alone."
    log "Debug environment is up. Server: ${HEALTH_URL}"
    exit 0
fi

# The SDK location, in the same order Android Studio resolves it. The
# local.properties form is Java .properties escaped ("C\:\\Users\\..."), so
# unescape it before use.
sdk_root=""
if [ -n "${ANDROID_HOME:-}" ]; then
    sdk_root="$ANDROID_HOME"
elif [ -n "${ANDROID_SDK_ROOT:-}" ]; then
    sdk_root="$ANDROID_SDK_ROOT"
elif [ -f android/local.properties ]; then
    sdk_root="$(sed -n 's/^sdk\.dir=//p' android/local.properties | head -1 | sed 's/\\\\/\//g; s/\\//g')"
fi

adb_bin="$(command -v adb || true)"
if [ -z "$adb_bin" ] && [ -n "$sdk_root" ] && [ -x "$sdk_root/platform-tools/adb" ]; then
    adb_bin="$sdk_root/platform-tools/adb"
fi

if [ -z "$adb_bin" ]; then
    warn "adb not found - skipping the device step. Set ANDROID_HOME, or start a device from Android Studio."
    log "Server is up regardless: ${HEALTH_URL}"
    exit 0
fi

if "$adb_bin" devices | awk 'NR > 1 && $2 == "device"' | grep -q .; then
    log "A device is already attached - nothing to start."
    log "Debug environment is up. Server: ${HEALTH_URL}"
    exit 0
fi

emulator_bin=""
if [ -n "$sdk_root" ] && [ -x "$sdk_root/emulator/emulator" ]; then
    emulator_bin="$sdk_root/emulator/emulator"
else
    emulator_bin="$(command -v emulator || true)"
fi

if [ -z "$emulator_bin" ]; then
    warn "No emulator binary found - start a device from Android Studio instead."
    log "Server is up regardless: ${HEALTH_URL}"
    exit 0
fi

avd="${KG_AVD:-}"
if [ -z "$avd" ]; then
    avd="$("$emulator_bin" -list-avds 2>/dev/null | head -1)"
fi

if [ -z "$avd" ]; then
    warn "No AVD defined. Create one in Device Manager - a 7 to 8 inch tablet is the interesting shape for this app."
    log "Server is up regardless: ${HEALTH_URL}"
    exit 0
fi

log "Starting emulator: ${avd}"
"$emulator_bin" -avd "$avd" -netdelay none -netspeed full >/dev/null 2>&1 &

log "Waiting for it to finish booting..."
"$adb_bin" wait-for-device
deadline=$((SECONDS + EMULATOR_TIMEOUT))
until [ "$("$adb_bin" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    if [ "$SECONDS" -ge "$deadline" ]; then
        die "Emulator did not finish booting within ${EMULATOR_TIMEOUT}s."
    fi
    sleep 2
done

log "Emulator ready."
log "Debug environment is up. Server ${HEALTH_URL}, reachable from the app as http://10.0.2.2:8000/"
