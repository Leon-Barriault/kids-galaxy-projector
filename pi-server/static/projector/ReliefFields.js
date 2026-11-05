/**
 * Relief fields: the distance, bevel and crease-shading arithmetic behind
 * raised paint, kept free of three.js and of the DOM.
 *
 * Split out of BeveledPatchRelief.js so the per-planet surface maps can be built
 * in a worker (see ManifestMapsWorker.js) - module workers do not see the page's
 * import map, so nothing here may import 'three'. BeveledPatchRelief re-exports
 * everything, so existing imports keep working.
 */

/**
 * A 2D canvas wherever this runs: a DOM canvas on the page, an OffscreenCanvas
 * in a worker. Returns null where neither exists (plain Node).
 */
export function createCanvas(width, height) {
  if (typeof document !== 'undefined' && document.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  return null;
}

// Width of the rounded shoulder, in mask texels, measured inward from the edge
// of a painted region. The stages this replaced used 22 and 5-11. Twenty-two
// texels of 512 is about 15 degrees of longitude, roughly 0.27 world units of
// arc against 0.038 units of height - a shoulder seven times wider than it was
// tall, which is a hill by any reading. Five gives close to a 45 degree bevel.
export const BEVEL_TEXELS = 5;

// How far up the patch stands the moment it exists at all, as a fraction of its
// full height. This is the wall. The mask is binary, so the step from body to
// WALL_FRACTION happens across a single texel and lands as one near-vertical
// quad - which is what puts a hard shading break and a crease shadow at the base
// of every patch. Below about 0.3 the crease stops reading; above about 0.6 thin
// strokes look like they were stamped out of sheet metal.
export const WALL_FRACTION = 0.45;

// Contact shading. Ambient occlusion in three.js only attenuates *indirect*
// light, which is the correct and slightly counter-intuitive place for this: the
// look is environment-dominant, so darkening the crease in the aoMap deepens it
// without touching the key light's terminator. The stages this replaced instead
// multiplied the darkening into the albedo, which dims the diffuse term but
// leaves clearcoat and environment reflection sitting on top at full strength -
// so the crease came back washed out and the flat colours came back muddy.
export const AO_TEXELS = 7;
export const AO_STRENGTH = 0.5;
// The body beside a patch is far more occluded than the patch's own shoulder is,
// so the two sides of a boundary are not weighted the same.
export const AO_PAINTED_SIDE = 0.45;

/**
 * Height of a painted texel, given its distance *to the region's edge*.
 *
 * Distance is measured in texels from the edge itself, not from the last
 * unpainted texel centre: zero is exactly on the boundary. That matters because
 * the boundary no longer falls on texel centres - see edgeSeedDistance.
 */
export function bevelProfile(distance, bevelTexels = BEVEL_TEXELS, wall = WALL_FRACTION) {
  if (!(distance > 0)) return 0;
  const t = Math.min(1, distance / Math.max(1e-6, bevelTexels));
  // Quarter circle: vertical where it leaves the wall, flat where it reaches the
  // top. A smoothstep here is flat at both ends and rounds the crease away.
  const arc = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
  return wall + (1 - wall) * arc;
}

/**
 * Where the region's edge actually sits inside a partly covered texel.
 *
 * A binary mask can only put a boundary on a texel edge, so a gently sloping
 * band snaps to whole rows: it runs along one row for a dozen texels, steps
 * down, runs along the next. The wide smoothstep shoulder this pipeline used to
 * have smeared that away. A one-texel wall does the opposite - every snap
 * becomes a facet with its own normal, and the planet grows a visible staircase
 * along every near-horizontal edge.
 *
 * The fix is not more mask resolution, which only halves the step. It is to stop
 * throwing away the coverage the rasteriser already computed. For a straight
 * edge crossing a texel with coverage c, the texel centre sits (c - 0.5) inside
 * the region, so seeding the distance transform with that instead of a flat 1
 * lets the wall slide continuously along the edge.
 */
/**
 * Returns a SIGNED distance in [-0.5, +0.5]: positive inside, negative outside.
 *
 * The sign matters and clamping it at zero is a bug. Relaxation adds one per
 * texel step, so a fully covered texel next to a fully uncovered one should end
 * up at (outside seed + 1). Seed the outside at 0 and that gives 1.0, while the
 * same texel a fraction of a texel later - once its own coverage drops below one
 * and it seeds itself - gives 0.5. The field then jumps by half a texel exactly
 * where it was supposed to be smoothest, which is a staircase again, just a
 * subtler one. Seeding the outside at -0.5 makes the two agree.
 */
export function edgeSeedDistance(coverage) {
  return Math.min(1, Math.max(0, coverage)) - 0.5;
}

/**
 * Chamfer distance from a seed mask, on an equirectangular field.
 *
 * Longitude wraps so a region crossing the seam is not bevelled down the middle
 * of its own back. Latitude clamps instead: the row above the north pole is the
 * pole, not empty space, and treating it as an edge dents the centre of the cap.
 */
export function chamferDistance(seed, width, height) {
  const texels = width * height;
  const far = width + height;
  const distance = new Float32Array(texels);
  for (let i = 0; i < texels; i += 1) distance[i] = seed[i] ? 0 : far;
  return relaxDistanceField(distance, width, height);
}

/**
 * Propagate an already-seeded distance field.
 *
 * Split out from chamferDistance so a caller can seed with sub-texel edge
 * positions from edgeSeedDistance() rather than with a binary in/out mask.
 * Everything about the sweeps is the same; only where they start differs.
 */
export function relaxDistanceField(distance, width, height) {
  const relax = (v, u, dv, du) => {
    const nv = v + dv;
    if (nv < 0 || nv >= height) return;
    const nu = (u + du + width) % width;
    const candidate = distance[nv * width + nu] + (dv && du ? 1.414 : 1);
    const texel = v * width + u;
    if (candidate < distance[texel]) distance[texel] = candidate;
  };

  // Two sweeps each way; the second lets a distance that had to travel around
  // the seam finish propagating.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let v = 0; v < height; v += 1) {
      for (let u = 0; u < width; u += 1) {
        relax(v, u, -1, 0);
        relax(v, u, -1, -1);
        relax(v, u, -1, 1);
        relax(v, u, 0, -1);
      }
    }
    for (let v = height - 1; v >= 0; v -= 1) {
      for (let u = width - 1; u >= 0; u -= 1) {
        relax(v, u, 1, 0);
        relax(v, u, 1, 1);
        relax(v, u, 1, -1);
        relax(v, u, 0, 1);
      }
    }
  }

  return distance;
}

/**
 * Crease shading, as a greyscale canvas for aoMap.
 *
 * Occlusion is driven by distance to the nearest boundary from whichever side a
 * texel sits on, so the body darkens as it approaches a patch and the patch
 * darkens as it approaches its own wall, and the two meet at the crease.
 */
export function buildCreaseAoCanvas({ owner, distanceIn, width, height }) {
  const texels = width * height;

  const paintedSeed = new Uint8Array(texels);
  let painted = 0;
  for (let i = 0; i < texels; i += 1) {
    if (owner[i] >= 0) {
      paintedSeed[i] = 1;
      painted += 1;
    }
  }
  // Nothing painted means nothing to occlude. Skipping the transform here also
  // keeps an all-body planet off a 512x256 double sweep that can only return
  // "far" everywhere.
  if (painted === 0 || painted === texels) return null;

  const distanceOut = chamferDistance(paintedSeed, width, height);

  const canvas = createCanvas(width, height);
  const context = canvas?.getContext('2d', { alpha: false });
  if (!context) return null;

  const image = context.createImageData(width, height);
  for (let i = 0; i < texels; i += 1) {
    const inside = owner[i] >= 0;
    const distance = inside ? distanceIn[i] : distanceOut[i];
    const t = Math.min(1, distance / AO_TEXELS);
    const occlusion = 1 - t * t * (3 - 2 * t);
    const side = inside ? AO_PAINTED_SIDE : 1;
    const ao = Math.max(0, 1 - AO_STRENGTH * side * occlusion);
    const value = Math.round(ao * 255);
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
