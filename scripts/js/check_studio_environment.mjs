import { STUDIO_SOURCES, buildStudioRadianceField } from './StudioEnvironment.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

const field = buildStudioRadianceField();
const { data, width, height } = field;
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const at = (row, column) => {
  const o = (row * width + column) * 4;
  return [data[o], data[o + 1], data[o + 2]];
};

// three.js: u = atan2(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5. Row 0 is v = 1
// because the texture uploads with flipY.
const directionAt = (row, column) => {
  const v = 1 - (row + 0.5) / height;
  const elevation = (v - 0.5) * Math.PI;
  const phi = ((column + 0.5) / width - 0.5) * Math.PI * 2;
  return [Math.cos(elevation) * Math.cos(phi), Math.sin(elevation), Math.cos(elevation) * Math.sin(phi)];
};
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
};
const angleBetween = (a, b) => {
  const p = norm(a);
  const q = norm(b);
  return (Math.acos(Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))) * 180) / Math.PI;
};

console.log('\n1. energy is held, not added');
let weighted = 0;
let weight = 0;
for (let row = 0; row < height; row += 1) {
  const v = 1 - (row + 0.5) / height;
  const w = Math.cos((v - 0.5) * Math.PI);
  for (let column = 0; column < width; column += 1) {
    weighted += luminance(...at(row, column)) * w;
    weight += w;
  }
}
const mean = weighted / weight;
check(
  'solid-angle-weighted mean matches the gradient it replaces',
  Math.abs(mean - STUDIO_SOURCES.LEGACY_MEAN_LUMINANCE) < 1e-4,
  `${mean.toFixed(5)} vs ${STUDIO_SOURCES.LEGACY_MEAN_LUMINANCE}`,
);
console.log(`       normalisation applied: x${field.scale.toFixed(4)}`);

console.log('\n2. the key is where it was aimed');
let brightest = { luminance: -1, row: 0, column: 0 };
for (let row = 0; row < height; row += 1) {
  for (let column = 0; column < width; column += 1) {
    const l = luminance(...at(row, column));
    if (l > brightest.luminance) brightest = { luminance: l, row, column };
  }
}
const brightestDirection = directionAt(brightest.row, brightest.column);
const offAxis = angleBetween(brightestDirection, STUDIO_SOURCES.KEY.direction);
check(
  'brightest texel sits inside the key cone',
  offAxis <= STUDIO_SOURCES.KEY.coreDegrees,
  `${offAxis.toFixed(1)} degrees off the key axis`,
);

// argmax alone is a brittle way to ask "where is the light" - one texel decides
// it, and a flat-topped source makes the answer arbitrary. The luminance-weighted
// centroid of the brightest decile is the same question asked of the whole
// highlight, and it stays meaningful whatever shape the source takes.
const sorted = [];
for (let row = 0; row < height; row += 1) {
  for (let column = 0; column < width; column += 1) {
    sorted.push({ l: luminance(...at(row, column)), row, column });
  }
}
sorted.sort((a, b) => b.l - a.l);
const decile = sorted.slice(0, Math.round(sorted.length * 0.1));
let centroid = [0, 0, 0];
let centroidWeight = 0;
for (const sample of decile) {
  const direction = directionAt(sample.row, sample.column);
  centroid = centroid.map((c, i) => c + direction[i] * sample.l);
  centroidWeight += sample.l;
}
centroid = centroid.map((c) => c / centroidWeight);
const centroidOffAxis = angleBetween(centroid, STUDIO_SOURCES.KEY.direction);
check(
  'the highlight as a whole is centred on the key',
  centroidOffAxis <= STUDIO_SOURCES.KEY.coreDegrees,
  `${centroidOffAxis.toFixed(1)} degrees off the key axis`,
);
check(
  'the key is above the horizon',
  brightestDirection[1] > 0.3,
  `y = ${brightestDirection[1].toFixed(2)}`,
);
check(
  'the key is camera-left (-x) and in front (+z)',
  brightestDirection[0] < 0 && brightestDirection[2] > 0,
  `x = ${brightestDirection[0].toFixed(2)}, z = ${brightestDirection[2].toFixed(2)}`,
);

console.log('\n3. it has shape a gradient could not have');
// The old map was a pure function of elevation: every texel in a row identical.
// Directionality means rows must now vary along longitude.
const midRow = Math.round(height * 0.3);
let rowMin = Infinity;
let rowMax = -Infinity;
for (let column = 0; column < width; column += 1) {
  const l = luminance(...at(midRow, column));
  rowMin = Math.min(rowMin, l);
  rowMax = Math.max(rowMax, l);
}
check(
  'a single latitude varies along longitude',
  rowMax / rowMin > 2,
  `${rowMin.toFixed(3)} to ${rowMax.toFixed(3)} across one row`,
);

const skyDirection = [0, 1, 0];
let skySample = 0;
let skyCount = 0;
for (let column = 0; column < width; column += 1) {
  // A band well away from every source, to stand in for "ambient sky".
  const direction = directionAt(Math.round(height * 0.62), column);
  if (
    angleBetween(direction, STUDIO_SOURCES.KEY.direction) > STUDIO_SOURCES.KEY.edgeDegrees &&
    angleBetween(direction, STUDIO_SOURCES.FILL.direction) > STUDIO_SOURCES.FILL.edgeDegrees &&
    angleBetween(direction, STUDIO_SOURCES.RIM.direction) > STUDIO_SOURCES.RIM.edgeDegrees
  ) {
    skySample += luminance(...at(Math.round(height * 0.62), column));
    skyCount += 1;
  }
}
const ambient = skyCount > 0 ? skySample / skyCount : 0;
const ratio = brightest.luminance / ambient;
check('an unlit sky region exists to measure against', skyCount > 0, `${skyCount} texels`);
check(
  'key-to-ambient ratio is a soft studio, not a hard sun',
  ratio > 3 && ratio < 12,
  `${ratio.toFixed(1)}:1`,
);
check(
  'the shadow side stays lifted rather than going black',
  ambient / STUDIO_SOURCES.LEGACY_MEAN_LUMINANCE > 0.35,
  `ambient ${ambient.toFixed(3)} vs old flat ${STUDIO_SOURCES.LEGACY_MEAN_LUMINANCE}`,
);

console.log('\n4. sanity');
check('no NaN or negative radiance', data.every((v) => Number.isFinite(v) && v >= 0));
check(
  'the field is HDR — a light is brighter than white',
  brightest.luminance > 1,
  `peak luminance ${brightest.luminance.toFixed(3)}`,
);
check('alpha is fully opaque throughout', data.filter((_, i) => i % 4 === 3).every((a) => a === 1));

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
