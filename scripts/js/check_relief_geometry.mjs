import {
  AO_STRENGTH,
  BEVEL_TEXELS,
  WALL_FRACTION,
  bevelProfile,
  buildBeveledReliefGeometry,
  buildCreaseAoCanvas,
  chamferDistance,
  edgeSeedDistance,
  relaxDistanceField,
} from './BeveledPatchRelief.js';

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ok   ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
};

const W = 512;
const H = 256;

console.log('\n1. bevelProfile — wall then quarter-circle arc');
check('unpainted is flat', bevelProfile(0) === 0, `p(0)=${bevelProfile(0)}`);
// Distance is measured from the edge itself now, not from the last unpainted
// texel centre, because coverage puts the edge between texel centres.
// Loose on purpose. The arc is tangent-VERTICAL where it leaves the wall, so
// even a distance of 1e-6 lifts it a measurable fraction above WALL_FRACTION -
// sqrt() has infinite slope at zero. That steepness is the whole reason the
// profile is an arc rather than a smoothstep, so the tolerance has to admit it.
check(
  'the wall stands up the instant the region begins',
  Math.abs(bevelProfile(1e-6) - WALL_FRACTION) < 1e-2,
  `p(0+)=${bevelProfile(1e-6).toFixed(4)} vs WALL=${WALL_FRACTION}`,
);
check(
  'reaches full height at the end of the shoulder',
  Math.abs(bevelProfile(BEVEL_TEXELS) - 1) < 1e-9,
  `p(${BEVEL_TEXELS})=${bevelProfile(BEVEL_TEXELS).toFixed(4)}`,
);
check('saturates past the shoulder', bevelProfile(400) === 1);
let monotonic = true;
let previous = -1;
for (let d = 0; d <= 20; d += 0.25) {
  const value = bevelProfile(d);
  if (value < previous - 1e-12) monotonic = false;
  previous = value;
}
check('monotonic non-decreasing', monotonic);
// The shoulder must be steep where it leaves the wall and shallow at the top —
// that is what a fillet is, and what a smoothstep gets exactly backwards.
const slopeAtWall = bevelProfile(0.25) - bevelProfile(1e-6);
const slopeAtTop = bevelProfile(BEVEL_TEXELS) - bevelProfile(BEVEL_TEXELS - 0.25);
check(
  'steep at the wall, flat at the top',
  slopeAtWall > slopeAtTop * 3,
  `d=${slopeAtWall.toFixed(4)} vs ${slopeAtTop.toFixed(4)}`,
);
const smoothstepAt = (t) => t * t * (3 - 2 * t);
check(
  'crease is sharper than the smoothstep it replaced',
  bevelProfile(1e-6) > smoothstepAt(1 / 22),
  `${bevelProfile(1e-6).toFixed(3)} vs old ${smoothstepAt(1 / 22).toFixed(3)}`,
);

console.log('\n1b. sub-texel edges - the staircase fix');
check('a fully covered texel is half a texel inside', edgeSeedDistance(1) === 0.5);
check('a half covered texel sits exactly on the edge', edgeSeedDistance(0.5) === 0);
check('an uncovered texel is half a texel OUTSIDE', edgeSeedDistance(0) === -0.5);
check(
  'coverage moves the edge continuously across a texel',
  edgeSeedDistance(0.6) > edgeSeedDistance(0.55) &&
    edgeSeedDistance(0.55) > edgeSeedDistance(0.51),
);

// A band whose edge slopes three rows across the map. With a binary mask the
// edge can only sit on whole rows, so the wall height along it takes a handful
// of discrete values - that is the staircase, one facet per step. With coverage
// it should vary smoothly.
const SLOPE_W = 512;
const SLOPE_H = 256;
// Periodic, because longitude wraps and the distance transform wraps with it.
// A linear ramp from row 100 to row 103 puts a three-row cliff at the seam,
// which the relaxation then propagates - and the resulting jump at u=1 is a
// property of the fixture, not of the field being tested. Real strokes are run
// through makePeriodic for precisely this reason.
const edgeRowAt = (u) => 101.5 + 1.5 * Math.sin((2 * Math.PI * u) / SLOPE_W);

const heightsAlongEdge = (useCoverage) => {
  const distance = new Float32Array(SLOPE_W * SLOPE_H);
  const far = SLOPE_W + SLOPE_H;
  for (let v = 0; v < SLOPE_H; v += 1) {
    for (let u = 0; u < SLOPE_W; u += 1) {
      const i = v * SLOPE_W + u;
      // Coverage of this texel by a band running from edgeRowAt(u) downward.
      const covered = Math.min(1, Math.max(0, v - edgeRowAt(u) + 0.5));
      if (covered <= 0) {
        distance[i] = useCoverage ? edgeSeedDistance(0) : 0;
      } else if (useCoverage) {
        distance[i] = covered >= 0.999 ? far : edgeSeedDistance(covered);
      } else {
        // The binary mask this replaces: in or out, nothing between.
        distance[i] = covered >= 0.5 ? far : 0;
      }
    }
  }
  relaxDistanceField(distance, SLOPE_W, SLOPE_H);
  // A fixed row, with the sloping edge sliding underneath it. Sampling relative
  // to the edge - Math.round(edgeRowAt(u)) + 2 - moves the sample row itself in
  // whole-texel jumps, which manufactures exactly the step being looked for.
  const out = [];
  const row = 103;
  for (let u = 0; u < SLOPE_W; u += 1) {
    out.push(bevelProfile(distance[row * SLOPE_W + u]));
  }
  return out;
};

const binaryHeights = heightsAlongEdge(false);
const coverageHeights = heightsAlongEdge(true);
const distinctOf = (values) => new Set(values.map((h) => h.toFixed(3))).size;
// Only where both samples sit on the rounded shoulder, above the wall. The step
// from the wall down to the body is a real discontinuity that the profile puts
// there on purpose - measuring it alongside the staircase conflates the feature
// with the defect, and reports a correctly smoothed edge as no better than a
// quantised one.
const biggestJumpOnArc = (values) => {
  let worst = 0;
  for (let i = 1; i < values.length; i += 1) {
    const floor = WALL_FRACTION + 0.02;
    if (values[i] <= floor || values[i - 1] <= floor) continue;
    worst = Math.max(worst, Math.abs(values[i] - values[i - 1]));
  }
  return worst;
};

console.log(
  `       binary mask: ${distinctOf(binaryHeights)} distinct heights along the edge, ` +
    `biggest shoulder step ${biggestJumpOnArc(binaryHeights).toFixed(4)}`,
);
console.log(
  `       coverage:    ${distinctOf(coverageHeights)} distinct heights along the edge, ` +
    `biggest shoulder step ${biggestJumpOnArc(coverageHeights).toFixed(4)}`,
);
check(
  'the binary mask really does staircase (guards the guard)',
  biggestJumpOnArc(binaryHeights) > 0.03,
  `step ${biggestJumpOnArc(binaryHeights).toFixed(4)}`,
);
check(
  'coverage removes the step',
  biggestJumpOnArc(coverageHeights) < biggestJumpOnArc(binaryHeights) / 5,
  `${biggestJumpOnArc(coverageHeights).toFixed(4)} vs ${biggestJumpOnArc(binaryHeights).toFixed(4)}`,
);
check(
  'and the edge height varies continuously along the slope',
  distinctOf(coverageHeights) > distinctOf(binaryHeights) * 4,
  `${distinctOf(coverageHeights)} vs ${distinctOf(binaryHeights)} levels`,
);

console.log('\n2. chamferDistance — wrapping longitude, clamped latitude');
// A band across every longitude: distance must depend only on latitude, which
// proves the seam wraps rather than acting as an edge.
const band = new Uint8Array(W * H);
for (let v = 0; v < H; v += 1) {
  for (let u = 0; u < W; u += 1) band[v * W + u] = v >= 100 && v < 140 ? 0 : 1;
}
const bandDistance = chamferDistance(band, W, H);
const rowValue = (v) => bandDistance[v * W + 0];
let uniform = true;
for (let v = 100; v < 140; v += 1) {
  for (let u = 0; u < W; u += 4) {
    if (Math.abs(bandDistance[v * W + u] - rowValue(v)) > 1e-6) uniform = false;
  }
}
check('a full-longitude band has no seam artefact', uniform);
check('band edge measures 1', rowValue(100) === 1, `row100=${rowValue(100)}`);
check('band centre is deepest', rowValue(119) === 20 && rowValue(120) === 20, `row119=${rowValue(119)}`);

// A patch straddling the seam must be bevelled around its outside only, not
// sliced down the middle of its own back at u=0.
const straddle = new Uint8Array(W * H);
for (let v = 0; v < H; v += 1) {
  for (let u = 0; u < W; u += 1) {
    const inU = u >= W - 20 || u < 20;
    straddle[v * W + u] = v >= 100 && v < 140 && inU ? 0 : 1;
  }
}
const straddleDistance = chamferDistance(straddle, W, H);
check(
  'a patch crossing the seam is not bevelled down its back',
  straddleDistance[120 * W + 0] > 15,
  `seam texel distance=${straddleDistance[120 * W + 0].toFixed(2)}`,
);
check(
  'poles clamp rather than reading as empty space',
  chamferDistance(new Uint8Array(W * H).fill(0), W, H)[0] === W + H,
  'all-painted field stays "far" at the pole',
);

console.log('\n3. buildBeveledReliefGeometry — real displaced, correctly-normalled geometry');
const RADIUS = 1.05;
const DISPLACEMENT = 0.042;
const heightField = new Float32Array(W * H);
const owner = new Int32Array(W * H).fill(-1);
for (let v = 0; v < H; v += 1) {
  for (let u = 0; u < W; u += 1) {
    const i = v * W + u;
    if (v >= 100 && v < 140) {
      owner[i] = 0;
      heightField[i] = bevelProfile(bandDistance[i]);
    }
  }
}

const started = Date.now();
const geometry = buildBeveledReliefGeometry({
  heightField,
  fieldWidth: W,
  fieldHeight: H,
  radius: RADIUS,
  displacement: DISPLACEMENT,
});
const elapsed = Date.now() - started;
check('geometry was built', Boolean(geometry));

const position = geometry.attributes.position;
const normal = geometry.attributes.normal;
const triangles = geometry.index ? geometry.index.count / 3 : position.count / 3;
console.log(
  `       ${position.count.toLocaleString()} verts, ${triangles.toLocaleString()} tris, built in ${elapsed}ms`,
);
// Deliberately not elapsed * 12: eleven of those twelve hit the sphere template
// cache and cost a fraction of the first. The honest per-gallery build number is
// reported once the cached build has been measured, further down.
console.log(`       gallery of 12 ≈ ${(triangles * 12).toLocaleString()} tris`);
// Raised from 2.5M when the grid was matched to the mask at 512x256. That is a
// measured optimum rather than a splurge - see RELIEF_SEGMENTS_W - and 3.1M
// triangles in one opaque pass with no shadow casters is comfortable on the
// desktop GPU this projector now targets. Still a budget, so it still has a
// ceiling.
check('gallery stays under 3.5M triangles', triangles * 12 < 3_500_000);

let minRadius = Infinity;
let maxRadius = -Infinity;
let nonUnitNormals = 0;
let nanCount = 0;
for (let i = 0; i < position.count; i += 1) {
  const x = position.getX(i);
  const y = position.getY(i);
  const z = position.getZ(i);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) nanCount += 1;
  const r = Math.sqrt(x * x + y * y + z * z);
  if (r < minRadius) minRadius = r;
  if (r > maxRadius) maxRadius = r;
  const nl = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
  if (Math.abs(nl - 1) > 1e-3) nonUnitNormals += 1;
}
check('no NaN positions', nanCount === 0);
check('all normals unit length', nonUnitNormals === 0, `${nonUnitNormals} bad`);
check(
  'unpainted body sits exactly on the sphere',
  Math.abs(minRadius - RADIUS) < 1e-6,
  `min r=${minRadius.toFixed(6)}`,
);
check(
  'paint stands proud by the full displacement',
  Math.abs(maxRadius - (RADIUS + DISPLACEMENT)) < 1e-6,
  `max r=${maxRadius.toFixed(6)}`,
);
check(
  'relief is visible in the silhouette',
  (maxRadius - minRadius) / RADIUS > 0.02,
  `${(((maxRadius - minRadius) / RADIUS) * 100).toFixed(1)}% of radius`,
);

// The whole point of rebuilding the geometry: the wall has to shade as a wall.
// On a smooth sphere every normal is radial, so a normal that has swung well off
// radial is proof that computeVertexNormals() saw real relief.
let maxTilt = 0;
for (let i = 0; i < position.count; i += 1) {
  const r = Math.hypot(position.getX(i), position.getY(i), position.getZ(i));
  const dot =
    (position.getX(i) * normal.getX(i) +
      position.getY(i) * normal.getY(i) +
      position.getZ(i) * normal.getZ(i)) /
    r;
  const tilt = Math.acos(Math.min(1, Math.max(-1, dot))) * (180 / Math.PI);
  if (tilt > maxTilt) maxTilt = tilt;
}
check(
  'wall normals tilt off radial (a smooth sphere would be 0°)',
  maxTilt > 30,
  `max tilt ${maxTilt.toFixed(1)}°`,
);

console.log('\n4. seam and pole normal welding');
const segmentsW = 512;
const segmentsH = 256;
const columns = segmentsW + 1;
check('vertex layout is the one the fast weld assumes', position.count === columns * (segmentsH + 1));
let seamMismatch = 0;
for (let row = 0; row <= segmentsH; row += 1) {
  const a = row * columns;
  const b = row * columns + segmentsW;
  const d = Math.hypot(
    normal.getX(a) - normal.getX(b),
    normal.getY(a) - normal.getY(b),
    normal.getZ(a) - normal.getZ(b),
  );
  if (d > 1e-6) seamMismatch += 1;
}
check('no lit seam from pole to pole', seamMismatch === 0, `${seamMismatch} rows differ`);
let poleMismatch = 0;
for (const row of [0, segmentsH]) {
  const first = row * columns;
  for (let column = 1; column <= segmentsW; column += 1) {
    const i = row * columns + column;
    const d = Math.hypot(
      normal.getX(first) - normal.getX(i),
      normal.getY(first) - normal.getY(i),
      normal.getZ(first) - normal.getZ(i),
    );
    if (d > 1e-6) poleMismatch += 1;
  }
}
check('no pinwheel at the caps', poleMismatch === 0, `${poleMismatch} verts differ`);
check('uv1 published for aoMap', Boolean(geometry.attributes.uv1));
check('geometry is tagged for safe disposal', geometry.userData.kidsGalaxyBeveledRelief === true);

console.log('\n5. crease occlusion');
// Minimal canvas stub — buildCreaseAoCanvas only needs createImageData/putImageData.
let captured = null;
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image) => {
        captured = image;
      },
    }),
  }),
};
const ao = buildCreaseAoCanvas({ owner, distanceIn: bandDistance, width: W, height: H });
check('an ao canvas was produced', Boolean(ao) && Boolean(captured));
const aoAt = (v, u) => captured.data[(v * W + u) * 4];
check(
  'body far from paint is unoccluded',
  aoAt(10, 0) === 255,
  `ao=${aoAt(10, 0)}`,
);
check(
  'body beside a patch is darkened',
  aoAt(99, 0) < 150,
  `ao just outside=${aoAt(99, 0)} (expect ≈${Math.round((1 - AO_STRENGTH) * 255)})`,
);
check(
  'the patch top recovers to unoccluded',
  aoAt(120, 0) === 255,
  `ao at patch centre=${aoAt(120, 0)}`,
);
check(
  'the body side is darker than the patch side of the same crease',
  aoAt(99, 0) < aoAt(101, 0),
  `${aoAt(99, 0)} vs ${aoAt(101, 0)}`,
);

console.log('\n6. template cache and radius round-trip');
const secondStart = Date.now();
const second = buildBeveledReliefGeometry({
  heightField,
  fieldWidth: W,
  fieldHeight: H,
  radius: RADIUS,
  displacement: DISPLACEMENT,
});
const secondElapsed = Date.now() - secondStart;
console.log(`       first build ${elapsed}ms, cached build ${secondElapsed}ms`);
check('cached build is materially faster', secondElapsed < elapsed * 0.7);
check(
  'a gallery of 12 costs under 1.2s of build',
  elapsed + secondElapsed * 11 < 1200,
  `≈${elapsed + secondElapsed * 11}ms`,
);
check(
  'cached build is identical to the first',
  second.attributes.position.count === position.count &&
    Math.abs(second.attributes.position.getX(1000) - position.getX(1000)) < 1e-9,
);
// Attributes must NOT be shared: three.js frees GPU buffers per attribute from
// geometry.dispose(), so a shared index would be pulled out from under the rest
// of the gallery the first time one planet is disposed.
check(
  'index buffers are per-planet, not shared',
  second.index.array !== geometry.index.array,
);
check(
  'position buffers are per-planet, not shared',
  second.attributes.position.array !== position.array,
);
check(
  'bounding sphere covers the raised paint',
  Math.abs(geometry.boundingSphere.radius - (RADIUS + DISPLACEMENT)) < 1e-6,
  `r=${geometry.boundingSphere.radius.toFixed(6)}`,
);

const { bodyRadiusOf } = await import('./BeveledPatchRelief.js');
check(
  'radius survives onto a rebuilt body (re-send safety)',
  bodyRadiusOf({ mesh: { geometry } }) === RADIUS,
  `read back ${bodyRadiusOf({ mesh: { geometry } })}`,
);
check(
  'radius falls back sanely for an unbuilt body',
  bodyRadiusOf({ mesh: { geometry: { parameters: { radius: 2.5 } } } }) === 2.5,
);

console.log(
  failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
