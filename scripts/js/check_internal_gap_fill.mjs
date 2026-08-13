/**
 * Internal band gaps must be filled *and* raised.
 *
 * A child who paints two ribbons with a sliver of background between them used
 * to get a trench: the base sphere sitting a full relief height below the paint
 * on either side, falling into shadow, reading as a black stripe.
 *
 * The stage that fixed this patched the finished albedo and then bridged relief
 * separately by rewriting the displacementMap. When relief became real geometry
 * that texture stopped existing - and because every access was carefully
 * null-guarded, nothing threw and nothing logged. It went on filling colour and
 * reporting success while raising nothing at all, and the trench came back.
 *
 * These checks exist because that failure was invisible. The load-bearing one is
 * the last: fill and relief are asserted together, so the two halves cannot come
 * apart again without something going red.
 */
import { fillInternalBandGaps, roundedRelief } from './ManifestStrokeSurface.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

const W = 512;
const H = 256;

// Two wrapped bands with a gap between them, and unpainted sky at both poles.
const BAND_A = { from: 60, to: 90, colour: [220, 40, 40] };
const BAND_B = { from: 120, to: 150, colour: [40, 90, 220] };

function paintedMaps() {
  const owner = new Int32Array(W * H).fill(-1);
  const colour = new Uint8ClampedArray(W * H * 3);
  const coverage = new Float32Array(W * H);
  const body = [30, 30, 40];
  for (let i = 0; i < W * H; i += 1) {
    colour[i * 3] = body[0];
    colour[i * 3 + 1] = body[1];
    colour[i * 3 + 2] = body[2];
  }
  [BAND_A, BAND_B].forEach((band, index) => {
    for (let v = band.from; v <= band.to; v += 1) {
      for (let u = 0; u < W; u += 1) {
        const texel = v * W + u;
        owner[texel] = index;
        colour[texel * 3] = band.colour[0];
        colour[texel * 3 + 1] = band.colour[1];
        colour[texel * 3 + 2] = band.colour[2];
        coverage[texel] = 1;
      }
    }
  });
  return { owner, colour, coverage };
}

const projections = [
  { strokeIndex: 0, wrapsLongitude: true, centerY: (BAND_A.from + BAND_A.to) / 2 / (H - 1) },
  { strokeIndex: 1, wrapsLongitude: true, centerY: (BAND_B.from + BAND_B.to) / 2 / (H - 1) },
];
const profiles = [
  { strokeIndex: 0, level: 0.8, shoulderTexels: 5 },
  { strokeIndex: 1, level: 0.9, shoulderTexels: 5 },
];

console.log('\n1. the gap between two bands is closed');
const maps = paintedMaps();
const gapRows = BAND_B.from - BAND_A.to - 1;
const result = fillInternalBandGaps(maps.owner, maps.colour, maps.coverage, projections);
check('something was filled', result.texels > 0, `${result.texels} texels`);
check(
  'the whole gap was filled, every longitude',
  result.texels === gapRows * W,
  `${result.texels} of ${gapRows * W}`,
);
check('the widest run matches the gap', result.widestRun === gapRows, `${result.widestRun} rows`);

const midRow = Math.floor((BAND_A.to + BAND_B.from) / 2);
check(
  'filled texels are owned',
  maps.owner[midRow * W + 0] >= 0,
  `owner=${maps.owner[midRow * W + 0]}`,
);
check('filled texels are fully covered, not feathered', maps.coverage[midRow * W + 0] === 1);
check(
  'filled colour comes from a band, not the body',
  maps.colour[midRow * W * 3] > 100,
  `r=${maps.colour[midRow * W * 3]}`,
);
// Nearer neighbour wins, so the two halves keep their own band's colour rather
// than one arbitrarily flooding the whole gap.
const nearA = (BAND_A.to + 2) * W;
const nearB = (BAND_B.from - 2) * W;
check(
  'each half takes the colour of its nearer band',
  maps.colour[nearA * 3] === BAND_A.colour[0] && maps.colour[nearB * 3 + 2] === BAND_B.colour[2],
  `${maps.colour[nearA * 3]},${maps.colour[nearA * 3 + 1]},${maps.colour[nearA * 3 + 2]} / ` +
    `${maps.colour[nearB * 3]},${maps.colour[nearB * 3 + 1]},${maps.colour[nearB * 3 + 2]}`,
);

console.log('\n2. the sky is not a gap');
check(
  'unpainted rows above the first band are untouched',
  maps.owner[10 * W + 0] < 0,
  `owner=${maps.owner[10 * W + 0]}`,
);
check(
  'unpainted rows below the last band are untouched',
  maps.owner[(H - 10) * W + 0] < 0,
  `owner=${maps.owner[(H - 10) * W + 0]}`,
);

console.log('\n3. a single band has no gap to bracket');
const lone = paintedMaps();
for (let v = BAND_B.from; v <= BAND_B.to; v += 1) {
  for (let u = 0; u < W; u += 1) lone.owner[v * W + u] = -1;
}
const loneResult = fillInternalBandGaps(lone.owner, lone.colour, lone.coverage, [projections[0]]);
check('nothing is filled with only one band', loneResult.texels === 0, `${loneResult.texels}`);

console.log('\n4. filled means raised - the half that broke silently');
// Relief is computed from ownership, so a filled gap has to come out of the
// ordinary relief pass with real height. This is the assertion that would have
// caught the regression: colour filled, nothing raised.
const filled = paintedMaps();
fillInternalBandGaps(filled.owner, filled.colour, filled.coverage, projections);
const { height } = roundedRelief(filled.owner, profiles, filled.coverage);

const trenchHeight = height[midRow * W + 0];
const bandHeight = height[Math.floor((BAND_A.from + BAND_A.to) / 2) * W + 0];
check('the bridged gap is raised at all', trenchHeight > 0, `height=${trenchHeight.toFixed(3)}`);
check(
  'and raised to a comparable height, so there is no trench',
  trenchHeight > bandHeight * 0.5,
  `gap ${trenchHeight.toFixed(3)} vs band ${bandHeight.toFixed(3)}`,
);

// Guards the guard: without the fill, that same texel must be flat. If this ever
// passes, the fixture stopped exercising the trench and check 4 proves nothing.
const unfilled = paintedMaps();
const { height: bare } = roundedRelief(unfilled.owner, profiles, unfilled.coverage);
check(
  'without the fill the same texel really is a trench',
  bare[midRow * W + 0] === 0,
  `height=${bare[midRow * W + 0]}`,
);

// And the sky stays flat either way - filling must not inflate the whole planet.
check(
  'polar sky is still flat after filling',
  height[10 * W + 0] === 0 && height[(H - 10) * W + 0] === 0,
);

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
