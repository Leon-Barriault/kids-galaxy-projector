/**
 * The child's paint must arrive on the planet as flat colour with hard edges.
 *
 * The tablet anti-aliases its strokes, so every region in the uploaded drawing
 * fades into the body over two or three pixels. Copying those pixels onto the
 * planet was tolerable while the relief was a wide soft ramp with edge darkening
 * painted over the top of it. With a one-texel geometric bevel wall it is not:
 * the colour boundary and the shading boundary end up in visibly different
 * places, and flat poster-paint patches come back as smudges.
 *
 * These checks drive labelStrokes/projectStrokes directly with a synthetic disc
 * whose stroke has a deliberately blended rim, and assert on the thing that
 * actually matters for the look: how many distinct colours come out.
 */
import { labelStrokes, projectStrokes } from './SoftToyPlanetSurface.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

const SIZE = 128;
const BODY = [200, 200, 200];
const RED = [220, 40, 40];
const BLUE = [40, 70, 210];

/**
 * A disc with two horizontal bands, each with a two-pixel anti-aliased rim -
 * the same fringe a real tablet upload carries.
 */
function syntheticDisc() {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const put = (x, y, rgb) => {
    const o = (y * SIZE + x) * 4;
    data[o] = rgb[0];
    data[o + 1] = rgb[1];
    data[o + 2] = rgb[2];
    data[o + 3] = 255;
  };
  const blend = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) put(x, y, BODY);
  }
  // Bands at rows 30-49 and 70-89, each fading in over two rows at both edges.
  const band = (from, to, colour) => {
    for (let y = from; y <= to; y += 1) {
      let t = 1;
      if (y === from || y === to) t = 0.35;
      else if (y === from + 1 || y === to - 1) t = 0.75;
      const shade = blend(BODY, colour, t);
      for (let x = 10; x < SIZE - 10; x += 1) put(x, y, shade);
    }
  };
  band(30, 49, RED);
  band(70, 89, BLUE);
  return { data, size: SIZE };
}

const disc = syntheticDisc();
const { labels, strokes } = labelStrokes(disc, BODY);

console.log('\n1. segmentation');
check('both bands are found as separate regions', strokes.length === 2, `${strokes.length} regions`);
if (strokes.length !== 2) {
  console.log(`\n${failures} check(s) FAILED.\n`);
  process.exit(1);
}

console.log('\n2. region colour is the interior, not the blended rim');
const near = (a, b, tolerance) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) <= tolerance;
const distanceFromBody = (c) =>
  Math.sqrt((c[0] - BODY[0]) ** 2 + (c[1] - BODY[1]) ** 2 + (c[2] - BODY[2]) ** 2);

for (const [label, target] of [
  ['red', RED],
  ['blue', BLUE],
]) {
  const stroke = strokes.find((s) => near(s.colour, target, 90));
  check(`the ${label} band recovers a colour close to what was painted`, Boolean(stroke),
    stroke ? `got ${stroke.colour.join(',')} for ${target.join(',')}` : 'no matching region');
  if (!stroke) continue;
  // The failure mode being guarded against is the average being dragged toward
  // the body colour by the rim. An unweighted mean of this disc lands well short.
  check(
    `the ${label} colour is not washed toward the body`,
    distanceFromBody(stroke.colour) > distanceFromBody(target) * 0.85,
    `${distanceFromBody(stroke.colour).toFixed(1)} of ${distanceFromBody(target).toFixed(1)} away from body`,
  );
}

console.log('\n3. the projected map is flat');
const { colour, owner } = projectStrokes(disc, BODY, labels, strokes);
const distinct = new Set();
for (let i = 0; i < owner.length; i += 1) {
  distinct.add(`${colour[i * 3]},${colour[i * 3 + 1]},${colour[i * 3 + 2]}`);
}
check(
  'exactly three colours across the whole map: body plus two bands',
  distinct.size === 3,
  `${distinct.size} distinct colours`,
);

// Every texel a region owns must be identical - that is what makes the albedo
// edge land exactly on the bevel wall instead of a few texels adrift of it.
for (const stroke of strokes) {
  const seen = new Set();
  let owned = 0;
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i] !== stroke.index) continue;
    owned += 1;
    seen.add(`${colour[i * 3]},${colour[i * 3 + 1]},${colour[i * 3 + 2]}`);
  }
  check(
    `region ${stroke.index} is a single flat colour across all ${owned} of its texels`,
    seen.size === 1,
    `${seen.size} colours`,
  );
}

// And the fringe is genuinely gone: no texel may hold an intermediate colour
// between the body and a band.
let fringe = 0;
for (let i = 0; i < owner.length; i += 1) {
  const c = [colour[i * 3], colour[i * 3 + 1], colour[i * 3 + 2]];
  const isBody = near(c, BODY, 1);
  const isBand = strokes.some((s) => near(c, s.colour, 1));
  if (!isBody && !isBand) fringe += 1;
}
check('no anti-aliased intermediate texels survive', fringe === 0, `${fringe} fringe texels`);

console.log('\n4. flattening did not eat the drawing');
let ownedTotal = 0;
for (let i = 0; i < owner.length; i += 1) if (owner[i] >= 0) ownedTotal += 1;
check(
  'the bands still cover a sensible share of the planet',
  ownedTotal / owner.length > 0.15 && ownedTotal / owner.length < 0.75,
  `${((ownedTotal / owner.length) * 100).toFixed(1)}% of texels painted`,
);

console.log('\n5. fringe absorption does not become colour merging');
// The other half of the coverage test. Absorbing a fringe means treating a
// dimmer version of a colour as the same stroke, and pink genuinely is a dimmer
// version of red measured from a pale body - so a band of pink painted hard
// against a band of red is the case that decides whether FRINGE_COVERAGE_BAND is
// set somewhere defensible. If this ever fails, the band has been loosened until
// deliberate colours are being eaten.
const PINK = [233, 30, 99];
function touchingBands() {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const put = (x, y, rgb) => {
    const o = (y * SIZE + x) * 4;
    data[o] = rgb[0];
    data[o + 1] = rgb[1];
    data[o + 2] = rgb[2];
    data[o + 3] = 255;
  };
  const blend = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) put(x, y, BODY);
  const band = (from, to, colour) => {
    for (let y = from; y <= to; y += 1) {
      const t = y === from || y === to ? 0.5 : 1;
      const shade = blend(BODY, colour, t);
      for (let x = 10; x < SIZE - 10; x += 1) put(x, y, shade);
    }
  };
  band(30, 49, RED);
  band(50, 69, PINK);
  return { data, size: SIZE };
}
const touching = labelStrokes(touchingBands(), BODY);
check(
  'pink painted hard against red stays two strokes',
  touching.strokes.length === 2,
  `${touching.strokes.length} regions: ${touching.strokes.map((s) => s.colour.join(',')).join(' | ')}`,
);
if (touching.strokes.length === 2) {
  check(
    'and each keeps its own colour',
    touching.strokes.some((s) => near(s.colour, RED, 20)) &&
      touching.strokes.some((s) => near(s.colour, PINK, 20)),
    touching.strokes.map((s) => s.colour.join(',')).join(' | '),
  );
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
