/**
 * Front-view projection: the disc is the face of the planet, its mirror the back.
 *
 * Pure arithmetic from FrontViewProjection.js, checked without a browser. The
 * properties that matter to a child are the ones asserted: a mark drawn on the
 * disc lands where it was drawn on the front, the back is its mirror image with
 * no seam at the limb, a stripe across the disc closes into a ring, and a dot
 * stays a dot instead of becoming one.
 */
import {
  canvasPointToDisc,
  discGeometryOf,
  discPointForTexel,
  normalizePlanetRendering,
  sampleDiscOntoSphere,
  strokeWidthInDiscRadii,
} from './FrontViewProjection.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const close = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

console.log('\n1. landmarks');
let [x, y] = discPointForTexel(0.25, 0.5);
check('front centre shows the disc centre', close(x, 0) && close(y, 0), `${x}, ${y}`);
[x, y] = discPointForTexel(0.75, 0.5);
check('back centre shows the disc centre too', close(x, 0) && close(y, 0), `${x}, ${y}`);
[x, y] = discPointForTexel(0.5, 0.5);
check('the +X limb shows the right edge of the disc', close(x, 1) && close(y, 0), `${x}, ${y}`);
[x, y] = discPointForTexel(0.3, 0);
check('the north pole shows the top of the disc', close(x, 0, 1e-6) && close(y, -1), `${x}, ${y}`);

console.log('\n2. orthographic when the rim is not eased');
let worst = 0;
for (let v = 0.05; v < 0.95; v += 0.05) {
  for (let u = 0.01; u < 0.5; u += 0.02) {
    const theta = v * Math.PI;
    const phi = u * 2 * Math.PI;
    const sx = -Math.cos(phi) * Math.sin(theta);
    const sy = Math.cos(theta);
    const [dx, dy] = discPointForTexel(u, v, 0);
    worst = Math.max(worst, Math.abs(dx - sx), Math.abs(dy + sy));
  }
}
check('the front view is exactly the drawing at rimEase 0', worst < 1e-9, `worst ${worst}`);

console.log('\n3. mirror and containment');
let asymmetric = 0;
let outside = 0;
for (let v = 0; v <= 1; v += 1 / 64) {
  for (let u = 0; u <= 1; u += 1 / 128) {
    const [ax, ay] = discPointForTexel(u, v);
    const [bx, by] = discPointForTexel(1 - u, v);
    asymmetric = Math.max(asymmetric, Math.abs(ax - bx), Math.abs(ay - by));
    if (Math.hypot(ax, ay) > 1 + 1e-9) outside += 1;
  }
}
check('the far side is the mirror image of the front', asymmetric < 1e-9, `worst ${asymmetric}`);
check('every sphere texel samples inside the disc', outside === 0, `${outside} outside`);

let previous = -1;
let monotonic = true;
for (let v = 0.5; v >= 0; v -= 1 / 256) {
  const [, dy] = discPointForTexel(0.25, v);
  if (-dy < previous - 1e-12) monotonic = false;
  previous = -dy;
}
check('the eased rim profile never folds back on itself', monotonic);

console.log('\n4. stripes, dots and disc geometry');
const W = 128;
const H = 64;
const size = 64;
const disc = {
  size,
  owner: new Int32Array(size * size).fill(-1),
  colour: new Uint8ClampedArray(size * size * 3),
  coverage: new Float32Array(size * size),
};
const paint = (px, py, owner) => {
  const index = py * size + px;
  disc.owner[index] = owner;
  disc.coverage[index] = 1;
};
for (let px = 0; px < size; px += 1) for (let py = 40; py < 44; py += 1) paint(px, py, 0);
for (let px = 46; px < 49; px += 1) for (let py = 18; py < 21; py += 1) paint(px, py, 1);
const sphere = sampleDiscOntoSphere(disc, { width: W, height: H, rimEase: 0 });
const rowCounts = (owner) => {
  const counts = [];
  for (let v = 0; v < H; v += 1) {
    let n = 0;
    for (let u = 0; u < W; u += 1) if (sphere.owner[v * W + u] === owner) n += 1;
    counts.push(n);
  }
  return counts;
};
check('a stripe across the disc closes into a full ring', Math.max(...rowCounts(0)) === W);
const dotRows = rowCounts(1);
check('a dot stays a dot (front and its mirror only)', Math.max(...dotRows) > 0 && Math.max(...dotRows) < W * 0.15, `${Math.max(...dotRows)} of ${W}`);

const geometry = discGeometryOf({ width: 1700, height: 1000 });
check('guide radius is 0.42 of the short canvas edge', close(geometry.radius, 420));
[x, y] = canvasPointToDisc([0.5, 0.5], geometry);
check('canvas centre is disc centre', close(x, 0) && close(y, 0));
[x, y] = canvasPointToDisc([0.5 + 420 / 1700, 0.5], geometry);
check('the guide edge is one disc radius out', close(x, 1) && close(y, 0), `${x}`);
check('stroke width in disc radii', close(strokeWidthInDiscRadii(0.042), 0.1));
const fallback = discGeometryOf(undefined);
check('a manifest without a canvas block still yields a disc', fallback.radius > 0);

console.log('\n5. wire values');
check('front-view is recognised', normalizePlanetRendering('front-view') === 'front-view');
check('missing means classic', normalizePlanetRendering(undefined) === 'classic');
check('unknown means classic', normalizePlanetRendering('hologram') === 'classic');

if (failures) {
  console.log(`\n${failures} front-view projection check(s) failed`);
  process.exit(1);
}
console.log('\nFront-view projection checks passed');
