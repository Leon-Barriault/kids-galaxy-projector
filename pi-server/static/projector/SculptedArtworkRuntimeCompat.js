/**
 * Compatibility binding for the first sculpted-artwork geometry revision.
 *
 * SculptedArtworkGeometry computes only a diagnostic relief value with the
 * historical BODY_RADIUS identifier. The actual body radius in that renderer
 * is BASE_RADIUS=1.056. Defining the global binding before the geometry builder
 * runs prevents that diagnostic line from aborting construction of otherwise
 * valid beveled kid-art meshes. This can disappear once the identifier is
 * folded into SculptedArtworkGeometry itself.
 */
export function installSculptedArtworkRuntimeCompat() {
  if (!Number.isFinite(globalThis.BODY_RADIUS)) {
    globalThis.BODY_RADIUS = 1.056;
  }
}
