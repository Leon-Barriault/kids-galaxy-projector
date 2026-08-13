#!/usr/bin/env bash
#
# Run the projector's rendering-maths checks under plain Node.
#
# These cover the parts of the render that are arithmetic rather than pixels:
# the bevel profile and normal welding in BeveledPatchRelief.js, the radiance
# field in StudioEnvironment.js, and the tone-curve exposure match behind
# GalaxyScene.js. None of it needs a GPU, a browser or a running server, which
# is the point - the Playwright checks in scripts/ cannot run without Chromium,
# and these numbers are exactly the ones worth catching before you get that far.
#
# The modules under test import three by bare specifier, resolved in the browser
# by the importmap in pi-server/static/index.html. Node has no importmap, so this
# assembles a scratch directory with a node_modules shim pointing at the same
# vendored build and runs there. Nothing is written inside the repository.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
projector="${repo_root}/pi-server/static/projector"
vendor="${repo_root}/pi-server/static/vendor/three.module.js"

command -v node >/dev/null || { echo "node required" >&2; exit 1; }
[ -f "${vendor}" ] || { echo "vendored three.js not found at ${vendor}" >&2; exit 1; }

scratch="$(mktemp -d)"
trap 'rm -rf "${scratch}"' EXIT

mkdir -p "${scratch}/node_modules/three"
cat > "${scratch}/node_modules/three/package.json" <<'JSON'
{ "name": "three", "version": "0.0.0", "type": "module", "main": "index.js", "exports": "./index.js" }
JSON
printf "export * from '%s';\n" "${vendor}" > "${scratch}/node_modules/three/index.js"
echo '{ "type": "module" }' > "${scratch}/package.json"

cp "${projector}/BeveledPatchRelief.js" "${projector}/StudioEnvironment.js" \
   "${projector}/SoftToyPlanetSurface.js" "${projector}/PlanetEntity.js" "${scratch}/"
cp "${repo_root}/scripts/js/"*.mjs "${scratch}/"

# SoftToyPlanetSurface pulls in PlanetEntity purely to monkeypatch its prototype
# at install time, and PlanetEntity drags most of the projector behind it. The
# segmentation functions under test touch none of that, so the import is stubbed
# rather than the whole scene graph copied in.
cat > "${scratch}/PlanetEntity.js" <<'JS'
export class PlanetEntity {}
JS

status=0
for check in check_relief_geometry.mjs check_studio_environment.mjs check_region_flatness.mjs derive_tone_exposure.mjs; do
  echo "=============================================================="
  echo "  ${check}"
  echo "=============================================================="
  if ! (cd "${scratch}" && node "${check}"); then
    status=1
  fi
done

if [ "${status}" -eq 0 ]; then
  echo "All projector rendering-maths checks passed."
else
  echo "Projector rendering-maths checks FAILED." >&2
fi
exit "${status}"
