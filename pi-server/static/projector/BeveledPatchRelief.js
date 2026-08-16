import * as THREE from 'three';

/**
 * Turn a painted region mask into real beveled geometry.
 *
 * Both surface stages used to raise paint with a displacementMap plus a bumpMap
 * on the stock 128x96 body sphere, and both produced a hill rather than a patch.
 * Two things were wrong with that, and neither is a tuning problem.
 *
 * The first is the profile. A smoothstep is tangent-flat at *both* ends, so the
 * paint left the body at zero gradient: there was no crease where a patch meets
 * the sphere, which is the single detail that reads as "laid on" rather than
 * "printed on". The reference look is a bevel-modifier cross-section - a short
 * near-vertical wall, then a rounded shoulder onto a flat top - so that is what
 * bevelProfile() draws. The wall is the WALL_FRACTION step the profile takes the
 * instant distance goes positive; the shoulder is a quarter-circle arc, which is
 * tangent-vertical at the wall and tangent-flat at the top, exactly the two
 * boundary conditions a fillet needs and exactly the two a smoothstep gets
 * backwards.
 *
 * The second is that three.js does not recompute normals for a displacementMap.
 * It moves the vertex along the existing normal in the vertex shader and leaves
 * the normal pointing where the undisplaced sphere pointed, so every displaced
 * surface is still *shaded* as a smooth ball. All the edge definition therefore
 * had to come from the bumpMap, reading derivatives of the same over-wide ramp -
 * a weak input producing a weak result. Displacing on the CPU and calling
 * computeVertexNormals() afterwards means the bevel gets its own normals, the
 * wall shades as a wall, and the silhouette carries the lumps for free.
 */

// The relief body sphere, matched one-to-one with the mask fields.
//
// This was 384x192 against a 512x256 mask, on the reasoning that a fillet
// sub-pixel at gallery distance did not need matching resolution. That was
// wrong in an interesting way: a coarser grid than the mask throws away the
// sub-texel edge position the mask now carries, so the wall snaps to the
// nearest vertex ring and a near-horizontal band edge steps once per ring.
//
// Measured, by building the geometry from a smooth periodic band edge and
// tracking the latitude at which the surface crosses half its relief height:
//
//     384x192   2.46e-3      1.8M tris / 12 planets
//     384x256   1.75e-3      2.4M
//     512x256   1.18e-3      3.1M     <- matches the mask
//     512x384   1.59e-3      4.7M
//     768x384   1.50e-3      7.1M
//
// Smoothness peaks where the grid matches the mask and then gets *worse*, which
// is the tell that this is a sampling problem rather than a density one: past
// 512x256 there is no further information in the field to resolve, and the
// interpolation phase against texel centres starts contributing its own error.
// 0.21 degrees of latitude is under a pixel on a gallery-sized planet.
// Dropped from the matched 512x256 once the polar twist landed on top of the
// build. Not for CPU reasons - building and twisting is 64ms a planet, 0.4s for
// a full gallery, which is nothing. It is triangle count: six planets at 262k
// triangles each, rendered by SwiftShader at 2560x1440 while six 700x700
// captures queue behind them, and snapshots started failing to publish inside
// their timeout.
//
// 384x192 is 147k triangles, 44% fewer. The measured cost is about a pixel of
// hero-frame edge smoothness - the apparent edge quantises at 0.44 degrees of
// latitude here against 0.21 at 512x256 - and in the gallery, where planets are
// small, both are already sub-pixel. Raise it back if captures stop being the
// constraint.
export const RELIEF_SEGMENTS_W = 384;
export const RELIEF_SEGMENTS_H = 192;

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
  if (typeof document === 'undefined') return null;
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

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
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

/**
 * Sample the relief field for a vertex UV.
 *
 * Longitude wraps and latitude clamps, matching the chamfer transform. The row
 * axis is flipped because a CanvasTexture arrives with flipY set, so canvas row
 * zero is the north pole and SphereGeometry's v=1 is the north pole too.
 */
function sampleRelief(field, width, height, u, v) {
  const x = u * width - 0.5;
  const y = (1 - v) * (height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrap = (column) => ((column % width) + width) % width;
  const clampRow = (row) => (row < 0 ? 0 : row > height - 1 ? height - 1 : row);
  const left = wrap(x0);
  const right = wrap(x0 + 1);
  const top = clampRow(y0) * width;
  const bottom = clampRow(y0 + 1) * width;
  const a = field[top + left];
  const b = field[top + right];
  const c = field[bottom + left];
  const d = field[bottom + right];
  const upper = a + (b - a) * fx;
  const lower = c + (d - c) * fx;
  return upper + (lower - upper) * fy;
}

function averageNormals(normal, indices) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const index of indices) {
    x += normal.getX(index);
    y += normal.getY(index);
    z += normal.getZ(index);
  }
  const length = Math.sqrt(x * x + y * y + z * z);
  if (length < 1e-8) return;
  x /= length;
  y /= length;
  z /= length;
  for (const index of indices) normal.setXYZ(index, x, y, z);
}

/**
 * Weld normals across the UV seam and at the poles.
 *
 * computeVertexNormals() averages the faces that *share a vertex index*, not the
 * faces that meet in space. SphereGeometry duplicates its first column at the
 * far end so the texture has somewhere to land at u=1, and collapses each pole
 * row onto a single point spread over many indices. Both copies displace
 * identically - the field wraps - so they end up at the same position with
 * different normals, and the result is a lit seam running pole to pole and a
 * pinwheel at each cap. Averaging the duplicates afterwards is cheaper and more
 * exact than trying to merge vertices before the normal pass.
 */
export function weldSeamAndPoleNormals(geometry, segmentsW, segmentsH) {
  const normal = geometry.attributes.normal;
  const columns = segmentsW + 1;
  const rows = segmentsH + 1;
  if (normal.count !== columns * rows) {
    weldByPosition(geometry);
    return;
  }

  for (let row = 0; row < rows; row += 1) {
    averageNormals(normal, [row * columns, row * columns + segmentsW]);
  }

  for (const row of [0, segmentsH]) {
    const indices = [];
    for (let column = 0; column < columns; column += 1) indices.push(row * columns + column);
    averageNormals(normal, indices);
  }

  normal.needsUpdate = true;
}

/**
 * Fallback weld for when the vertex layout is not the one SphereGeometry emits -
 * a three.js change, or a shaper that re-indexed. Slower, but assumes nothing.
 */
function weldByPosition(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const buckets = new Map();
  for (let i = 0; i < position.count; i += 1) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(
      position.getZ(i) * 1e4,
    )}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(i);
    else buckets.set(key, [i]);
  }
  for (const indices of buckets.values()) {
    if (indices.length > 1) averageNormals(normal, indices);
  }
  normal.needsUpdate = true;
}

/**
 * Build the body sphere with the child's paint standing proud of it as real,
 * beveled, correctly-shaded geometry.
 *
 * shapeGeometry runs before displacement so a style that deforms the body - the
 * cratered planets push vertices inward - is deformed first and then painted,
 * rather than having paint flattened against a shape it never saw. Displacement
 * is radial and expressed as a scale on the existing vertex length, which is why
 * paint inside a crater correctly rides the crater floor instead of floating at
 * the radius the sphere would have had.
 */
const sphereTemplates = new Map();

/**
 * The undisplaced sphere, generated once and thereafter copied.
 *
 * Constructing a 384x192 SphereGeometry is 58ms of trigonometry and index
 * building, which was nearly half the cost of a planet and was being paid twelve
 * times over for twelve identical spheres. Only the raw arrays are cached: each
 * planet gets its own BufferAttribute wrappers around them, because three.js
 * keys its GPU buffers on the attribute object and frees them from
 * geometry.dispose(), so genuinely sharing an attribute between two planets
 * would have the first one disposed pull the index buffer out from under the
 * rest of the gallery. Duplicating the upload is the cheap half of the problem;
 * duplicating the computation was the expensive half.
 */
function sphereTemplate(radius, segmentsW, segmentsH) {
  const key = `${radius}|${segmentsW}|${segmentsH}`;
  const cached = sphereTemplates.get(key);
  if (cached) return cached;
  const source = new THREE.SphereGeometry(radius, segmentsW, segmentsH);
  const template = {
    position: source.attributes.position.array,
    uv: source.attributes.uv.array,
    index: source.index.array,
  };
  sphereTemplates.set(key, template);
  return template;
}

export function buildBeveledReliefGeometry({
  heightField,
  fieldWidth,
  fieldHeight,
  radius = 1.05,
  displacement,
  shapeGeometry = null,
  segmentsW = RELIEF_SEGMENTS_W,
  segmentsH = RELIEF_SEGMENTS_H,
}) {
  if (!heightField || !fieldWidth || !fieldHeight) return null;

  const template = sphereTemplate(radius, segmentsW, segmentsH);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(template.position.slice(), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(template.uv.slice(), 2));
  geometry.setIndex(new THREE.BufferAttribute(template.index.slice(), 1));

  if (typeof shapeGeometry === 'function') shapeGeometry(geometry);

  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;

  let maxRadius = 0;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length < 1e-8) continue;
    const relief = sampleRelief(heightField, fieldWidth, fieldHeight, uv.getX(i), uv.getY(i));
    if (relief <= 0) {
      if (length > maxRadius) maxRadius = length;
      continue;
    }
    const raised = length + relief * displacement;
    if (raised > maxRadius) maxRadius = raised;
    const scale = raised / length;
    position.setXYZ(i, x * scale, y * scale, z * scale);
  }
  position.needsUpdate = true;

  geometry.computeVertexNormals();
  weldSeamAndPoleNormals(geometry, segmentsW, segmentsH);
  // Computed rather than measured. computeBoundingSphere() is another full pass
  // over 74k vertices for a number the displacement loop already knows, and the
  // body is centred on the origin by construction.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), maxRadius);

  // aoMap reads the second UV channel by default. The relief map shares the
  // body's layout exactly, so point the channel back at uv and also publish uv1
  // as the same buffer - one of the two satisfies every three.js version this
  // vendored build might be swapped for, and sharing the attribute costs no
  // memory.
  if (!geometry.attributes.uv1) geometry.setAttribute('uv1', geometry.attributes.uv);

  geometry.userData.kidsGalaxyBeveledRelief = true;
  geometry.userData.kidsGalaxyBodyRadius = radius;
  // Keep the shape of a SphereGeometry's introspection surface. This is a plain
  // BufferGeometry built from cached arrays, so it would otherwise arrive with
  // no .parameters at all - and the body sphere is read that way by the
  // projector smoke checks, which would fault on the missing object rather than
  // report a changed number. Anything that could ask "what sphere is this?"
  // still gets a truthful answer.
  geometry.parameters = {
    radius,
    widthSegments: segmentsW,
    heightSegments: segmentsH,
    phiStart: 0,
    phiLength: Math.PI * 2,
    thetaStart: 0,
    thetaLength: Math.PI,
  };
  return geometry;
}

/**
 * The radius a planet body was built at.
 *
 * Rebuilding the sphere means a surface stage has to agree with
 * createPlanetGeometry() about how big a planet is, and a hardcoded copy of that
 * number in each stage is a silent mismatch waiting for whichever one gets tuned
 * first. SphereGeometry keeps its constructor arguments on .parameters, and a
 * relief geometry built here kept the same value, so reading it back stays
 * correct when a child re-sends a drawing onto an already-rebuilt body.
 */
export function bodyRadiusOf(entity, fallback = 1.05) {
  const geometry = entity?.mesh?.geometry;
  // A body this module already rebuilt: a plain BufferGeometry, so the radius is
  // recorded rather than inferred.
  const rebuilt = geometry?.userData?.kidsGalaxyBodyRadius;
  if (Number.isFinite(rebuilt) && rebuilt > 0) return rebuilt;
  // A body still on the geometry createPlanetGeometry() made.
  const original = geometry?.parameters?.radius;
  return Number.isFinite(original) && original > 0 ? original : fallback;
}

/**
 * The shaper a style needs applied before paint, if any.
 *
 * Cratered bodies push vertices inward, and they have to do it before the relief
 * pass so paint inside a crater rides the crater floor rather than floating at
 * the radius the undeformed sphere would have had.
 */
export function bodyShaperFor(entity) {
  if (entity?.style !== 'cratered') return null;
  if (typeof entity.applyCraterShape !== 'function') return null;
  return (geometry) => entity.applyCraterShape(geometry);
}

/**
 * Swap relief geometry onto a planet, reclaiming only what this module made.
 *
 * The geometry an entity was constructed with is captured by stages that ran
 * before this one, and a disposed buffer that is still referenced is a hard
 * error on a real driver and a shrug under software rendering - which is exactly
 * the difference CI does not see. A previous relief build has no such readers,
 * and a child re-sending a drawing would otherwise leak a high-resolution sphere
 * on every send.
 */
export function attachReliefGeometry(entity, geometry) {
  const mesh = entity?.mesh;
  if (!mesh || !geometry) return false;
  const previous = mesh.geometry;
  mesh.geometry = geometry;
  if (previous && previous !== geometry && previous.userData?.kidsGalaxyBeveledRelief) {
    previous.dispose();
  }
  return true;
}
