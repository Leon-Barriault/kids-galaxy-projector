/**
 * Builds planet surface maps off the main thread.
 *
 * A module worker, loaded by ManifestMapsClient.js. It must not import 'three':
 * workers do not see the page's import map. ManifestMaps.js is three-free for
 * exactly this reason.
 */
import { buildSurfaceMaps, mapsToTransferable } from './ManifestMaps.js';

self.addEventListener('message', ({ data }) => {
  const { id, manifest, rendering } = data || {};
  try {
    const built = buildSurfaceMaps(manifest, rendering);
    if (!built) {
      self.postMessage({ id, ok: true, built: null });
      return;
    }
    const { message, transfer } = mapsToTransferable(built);
    self.postMessage({ id, ok: true, built: message }, transfer);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
});
