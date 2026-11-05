/**
 * Ask for a planet's surface maps without freezing the wall.
 *
 * Building them is the bulk of a planet's arrival cost: rasterising every
 * stroke, two passes of distance transform, crease occlusion. On the page it
 * stalled the animation for a visible moment each time a child sent a
 * drawing. Here it runs in a module worker and comes back as transferred
 * buffers.
 *
 * Where a worker cannot run - no Worker or OffscreenCanvas, the worker script
 * fails to load, or it throws - the same code runs on the page instead, so a
 * planet is never lost to the optimisation. One failure switches the worker off
 * for the rest of the page's life rather than paying for it on every planet.
 */
import { buildSurfaceMaps, mapsFromTransferable } from './ManifestMaps.js';

let worker = null;
let workerBroken = false;
let nextId = 0;
const pending = new Map();

function workerSupported() {
  return (
    !workerBroken &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof URL !== 'undefined'
  );
}

function failAll(reason) {
  workerBroken = true;
  worker?.terminate?.();
  worker = null;
  const waiting = Array.from(pending.values());
  pending.clear();
  waiting.forEach(({ reject }) => reject(reason));
}

function ensureWorker() {
  if (worker || !workerSupported()) return worker;
  try {
    worker = new Worker(new URL('./ManifestMapsWorker.js', import.meta.url), { type: 'module' });
  } catch (error) {
    workerBroken = true;
    return null;
  }
  worker.addEventListener('message', ({ data }) => {
    const request = pending.get(data?.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.ok) request.resolve(data.built ? mapsFromTransferable(data.built) : null);
    else request.reject(new Error(data.error || 'surface worker failed'));
  });
  worker.addEventListener('error', (event) => {
    event.preventDefault?.();
    failAll(new Error(event.message || 'surface worker failed to load'));
  });
  return worker;
}

function buildOnPage(manifest, rendering) {
  return new Promise((resolve, reject) => {
    // A macrotask, not a microtask, so the frame that triggered the build can
    // still be drawn first.
    setTimeout(() => {
      try {
        resolve(buildSurfaceMaps(manifest, rendering));
      } catch (error) {
        reject(error);
      }
    }, 0);
  });
}

/** Resolves to the built maps (canvases + relief field), or null. */
export function requestSurfaceMaps(manifest, rendering) {
  const target = ensureWorker();
  if (!target) return buildOnPage(manifest, rendering);
  nextId += 1;
  const id = nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      target.postMessage({ id, manifest, rendering });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  }).catch((error) => {
    console.warn('Kids Galaxy surface worker unavailable; building on the page', error);
    return buildOnPage(manifest, rendering);
  });
}

/** For diagnostics: whether maps are currently built off the main thread. */
export function surfaceWorkerActive() {
  return Boolean(worker) && !workerBroken;
}
