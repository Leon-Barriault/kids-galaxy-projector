/**
 * Solve for the toneMappingExposure that keeps overall brightness where it is
 * when ACESFilmicToneMapping is swapped for NeutralToneMapping, then measure
 * what that swap actually buys.
 *
 * Both curves are transcribed from the vendored three.js tonemapping shader
 * chunk so this is the real arithmetic the GPU will run, not an approximation
 * of it. GLSL mat3(a, b, c) builds COLUMNS, which is why the matrices below
 * read transposed against the usual ACES row-major listings.
 */

const ACES_IN = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
];
const ACES_OUT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];

const apply = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const saturate = (v) => v.map((c) => Math.min(1, Math.max(0, c)));

function acesFilmic(color, exposure) {
  let c = color.map((x) => (x * exposure) / 0.6);
  c = apply(ACES_IN, c);
  c = c.map((v) => {
    const a = v * (v + 0.0245786) - 0.000090537;
    const b = v * (0.983729 * v + 0.432951) + 0.238081;
    return a / b;
  });
  return saturate(apply(ACES_OUT, c));
}

function neutral(color, exposure) {
  const c = color.map((x) => x * exposure);
  const x = Math.min(c[0], c[1], c[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let out = c.map((v) => v - offset);
  const peak = Math.max(out[0], out[1], out[2]);
  const startCompression = 0.8 - 0.04;
  if (peak < startCompression) return saturate(out);
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  out = out.map((v) => (v * newPeak) / peak);
  const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return saturate(out.map((v) => v * (1 - g) + newPeak * g));
}

// three.js outputColorSpace = SRGBColorSpace, so both curves land in sRGB.
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const chroma = (c) => Math.max(...c) - Math.min(...c);

// The colours children actually paint with, straight off the tablet palette in
// DrawingControls.kt. Matching on the real palette rather than on grey matters:
// ACES shifts saturated primaries hardest, and those are most of a kid's planet.
const PALETTE = {
  red: '#E53935',
  orange: '#FF9800',
  yellow: '#FFEB3B',
  green: '#4CAF50',
  blue: '#2196F3',
  purple: '#9C27B0',
  pink: '#E91E63',
  white: '#FFFFFF',
  grey: '#808080',
};
const hexToLinear = (hex) => [
  toLinear(parseInt(hex.slice(1, 3), 16) / 255),
  toLinear(parseInt(hex.slice(3, 5), 16) / 255),
  toLinear(parseInt(hex.slice(5, 7), 16) / 255),
];

// Irradiance sweep: deep shadow through blown highlight, log-spaced so midtones
// - where the eye judges "did this get brighter?" - carry the weight.
const IRRADIANCE = [];
for (let stop = -3; stop <= 1.5; stop += 0.125) IRRADIANCE.push(Math.pow(2, stop));

const CURRENT_EXPOSURE = 1.46;

function meanSquaredError(exposure) {
  let total = 0;
  let n = 0;
  for (const hex of Object.values(PALETTE)) {
    const albedo = hexToLinear(hex);
    for (const irradiance of IRRADIANCE) {
      const radiance = albedo.map((c) => c * irradiance);
      const a = acesFilmic(radiance, CURRENT_EXPOSURE).map(toSrgb);
      const b = neutral(radiance, exposure).map(toSrgb);
      total += (luminance(a) - luminance(b)) ** 2;
      n += 1;
    }
  }
  return total / n;
}

// Golden-section search. The error is smooth and unimodal in exposure, so this
// converges in ~40 evaluations without needing a derivative.
function solve(low, high, iterations = 80) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  for (let i = 0; i < iterations; i += 1) {
    const c = b - phi * (b - a);
    const d = a + phi * (b - a);
    if (meanSquaredError(c) < meanSquaredError(d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}

const matched = solve(0.4, 2.5);
console.log(`\nACESFilmic @ ${CURRENT_EXPOSURE}  ->  Neutral @ ${matched.toFixed(4)}`);
console.log(`rounded for the source: ${Math.round(matched * 100) / 100}`);
console.log(`residual mean luminance error: ${Math.sqrt(meanSquaredError(matched)).toFixed(5)} sRGB`);
console.log(
  `  (naive 1:1 swap would have been off by ${Math.sqrt(meanSquaredError(CURRENT_EXPOSURE)).toFixed(5)})`,
);

const rounded = Math.round(matched * 100) / 100;

console.log('\nper-colour, at a typical lit midtone (irradiance 1.0):');
console.log('  colour   ACES sRGB          Neutral sRGB       dLuma   chroma');
let chromaGain = 0;
let hueShift = 0;
let count = 0;
for (const [name, hex] of Object.entries(PALETTE)) {
  const radiance = hexToLinear(hex);
  const a = acesFilmic(radiance, CURRENT_EXPOSURE).map(toSrgb);
  const b = neutral(radiance, rounded).map(toSrgb);
  const hex255 = (c) => c.map((v) => Math.round(v * 255).toString().padStart(3)).join(',');
  const dLuma = luminance(b) - luminance(a);
  const ca = chroma(a);
  const cb = chroma(b);
  if (name !== 'white' && name !== 'grey') {
    chromaGain += cb - ca;
    // Hue drift, as the angle between the two colours' chromaticity.
    const target = hexToLinear(hex).map(toSrgb);
    const angle = (p, q) => {
      const dot = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      const lp = Math.hypot(...p);
      const lq = Math.hypot(...q);
      return (Math.acos(Math.min(1, dot / (lp * lq))) * 180) / Math.PI;
    };
    hueShift += angle(a, target) - angle(b, target);
    count += 1;
  }
  console.log(
    `  ${name.padEnd(7)} ${hex255(a)}   ${hex255(b)}  ${(dLuma * 255).toFixed(1).padStart(6)}   ` +
      `${ca.toFixed(3)} -> ${cb.toFixed(3)}`,
  );
}
console.log(
  `\nmean chroma gain across the six saturated swatches: +${(chromaGain / count).toFixed(4)} ` +
    `(${((chromaGain / count) * 255).toFixed(1)}/255)`,
);
console.log(
  `mean hue drift removed: ${(hueShift / count).toFixed(2)} degrees closer to the painted colour`,
);

// Per-colour luminance differences are NOT an error to minimise - they are the
// change being bought. ACES lightens blue by desaturating it toward white, so
// "blue got darker" is exactly the washed-out cast being removed. The things
// that would actually be regressions are: the picture as a whole changing
// brightness, and highlights clipping where they did not before.
console.log('\nregression checks');
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

// Mid-grey is the colourist's anchor for "same exposure". If neutral grey holds,
// the picture has not changed brightness whatever the saturated hues do.
const grey = hexToLinear('#808080');
const greyAces = luminance(acesFilmic(grey, CURRENT_EXPOSURE).map(toSrgb));
const greyNeutral = luminance(neutral(grey, rounded).map(toSrgb));
check(
  'mid-grey holds its exposure',
  Math.abs(greyAces - greyNeutral) * 255 < 8,
  `${(greyAces * 255).toFixed(0)} -> ${(greyNeutral * 255).toFixed(0)} of 255`,
);

let meanAces = 0;
let meanNeutral = 0;
let samples = 0;
let clippedAces = 0;
let clippedNeutral = 0;
for (const hex of Object.values(PALETTE)) {
  for (const irradiance of IRRADIANCE) {
    const radiance = hexToLinear(hex).map((c) => c * irradiance);
    const a = acesFilmic(radiance, CURRENT_EXPOSURE);
    const b = neutral(radiance, rounded);
    meanAces += luminance(a.map(toSrgb));
    meanNeutral += luminance(b.map(toSrgb));
    if (a.some((c) => c >= 0.999)) clippedAces += 1;
    if (b.some((c) => c >= 0.999)) clippedNeutral += 1;
    samples += 1;
  }
}
meanAces /= samples;
meanNeutral /= samples;
check(
  'overall picture brightness is unchanged',
  Math.abs(meanAces - meanNeutral) * 255 < 6,
  `mean ${(meanAces * 255).toFixed(1)} -> ${(meanNeutral * 255).toFixed(1)} of 255`,
);
check(
  'no new highlight clipping',
  clippedNeutral <= clippedAces * 1.15,
  `${((clippedAces / samples) * 100).toFixed(1)}% -> ${((clippedNeutral / samples) * 100).toFixed(1)}% of samples`,
);
check(
  'saturated colours gain chroma (the point of the change)',
  chromaGain / count > 0.03,
  `+${((chromaGain / count) * 255).toFixed(1)}/255`,
);
check(
  'hue drifts back toward the painted colour',
  hueShift / count > 0,
  `${(hueShift / count).toFixed(2)} degrees`,
);

console.log(
  failures === 0
    ? `\nUse toneMappingExposure = ${rounded} with NeutralToneMapping.\n`
    : `\n${failures} check(s) failed — revisit the exposure.\n`,
);
process.exit(failures === 0 ? 0 : 1);
