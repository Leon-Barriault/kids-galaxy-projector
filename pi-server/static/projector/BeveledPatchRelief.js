import * as THREE from 'three';

import {
  AO_PAINTED_SIDE,
  AO_STRENGTH,
  AO_TEXELS,
  BEVEL_TEXELS,
  WALL_FRACTION,
  bevelProfile,
  buildCreaseAoCanvas,
  chamferDistance,
  edgeSeedDistance,
  relaxDistanceField,
} from './ReliefFields.js';

export {
  AO_PAINTED_SIDE,
  AO_STRENGTH,
  AO_TEXELS,
  BEVEL_TEXELS,
  WALL_FRACTION,
  bevelProfile,
  buildCreaseAoCanvas,
  chamferDistance,
  edgeSeedDistance,
  relaxDistanceField,
};

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
