#!/usr/bin/env bash
# Plug in one erased kid tablet, then paste:
#   bash scripts/prepare_kid_tablet.sh
# This installs the app that is already built and turns on lock mode.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$ROOT/scripts/provision_kid_tablet.sh" --skip-build "$@"
