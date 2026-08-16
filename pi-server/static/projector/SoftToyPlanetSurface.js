import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';
import {
  BEVEL_TEXELS,
  attachReliefGeometry,
  bevelProfile,
  bodyRadiusOf,
  bodyShaperFor,
  buildBeveledReliefGeometry,
  buildCreaseAoCanvas,
  edgeSeedDistance,
  relaxDistanceField,
} from './BeveledPatchRelief.js';
import { studioEnvironment } from './StudioEnvironment.js';

/**
 * Paint the child's drawing onto the planet as a surface, not as sculpture.
 *
 * The stages before this one convert a drawing into extruded patch meshes:
 * each coloured region becomes a slab that is scaled to fill 94% of the body
 * and wound 480 degrees of longitude. A blob a child paints in the middle of
 * the disc comes out as a ribbon lapping the planet one and a third times, and
 * the silhouette grows lumps where slabs stand proud of the sphere. No amount
 * of material tuning fixes that, because the shape is wrong before the shading
 * starts.
 *
 * Here each stroke keeps the shape the child drew and is wrapped around the
 * planet. The body colour they chose is the sphere; a stroke's position down
 * the drawing is its latitude, and its length is stretched around the full 360
 * degrees of longitude. A straight horizontal line is therefore still a band
 * right round the planet, exactly as before - but a wavy line stays wavy as it
 * goes round, and a line drawn top to bottom spirals from one pole to the other
 * instead of claiming every latitude it crosses.
 *
 * That last part is why this replaced a per-row collapse. Reducing each row of
 * the drawing to a single colour threw orientation away before anything else
 * happened, so a stroke owned every row it touched: a vertical line turned 85%
 * of the planet its colour, a diagonal 78%, and a wobbly line came back six
 * times thicker than it was drawn. Thinner than about ten pixels and the same
 * rule discarded the stroke entirely as a slip of the finger. There was no
 * middle setting - the drawing either vanished or took over.
 *
 * Paint is raised off the body by the same mask that decides its colour, so a
 * stroke has the thickness of poster paint rather than of a slab. That relief is
 * real geometry with its own normals - see BeveledPatchRelief.js - so it reads
 * at the terminator, in the crease shadow at the foot of every patch, and yes,
 * on the outline too. The earlier note here promised the silhouette would stay
 * perfectly round, which was describing the old slab problem's cure rather than
 * the goal: the reference look has hand-formed lumps at the edge, and a body
 * that stays a flawless circle is the giveaway that the paint is printed on.
 */

// Longitude carries information now, so the texture can no longer be eight
// columns of the same colour repeated. 512x256 is the smallest equirectangular
// map that holds a 512px drawing without visible stair-stepping along a
// diagonal stroke. At three maps per planet it is about 1.5 MB across a gallery
// of twelve - the 1024-wide map the old note warned about would be 72 MB.
const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;
// Relief is real geometry now, so this is a height in world units rather than a
// displacementScale multiplying a 0..1 map, and there is no body level left to
// cancel with a bias: unpainted body is exactly the sphere.
//
// Set to 0.042 while this could not be seen rendered, reasoning that the bevel
// profile holds a patch at full height across its whole outline where the old
// 22-texel smoothstep only reached it at the centre, so the same number would
// read thicker. Rendered, it read thinner than the reference, not thicker - the
// old profile's height was spread over a wide soft mound that caught light
// across its whole width, while a flat pad with a sharp wall only shows its
// thickness at the wall. 0.058 is what that costs to correct. Kept a little
// under the manifest path's 0.065 because this path's regions come from image
// segmentation and are correspondingly less crisp.
const RELIEF_DISPLACEMENT = 0.058;
// How far from the body colour a pixel must sit, in RGB units, before it counts
// as paint.
const PAINT_MATCH_DISTANCE = 26;
// A run of connected paint this small is anti-aliasing or a slip of the finger
// rather than a stroke. This replaces the old per-row coverage fraction, which
// measured the wrong thing: it asked how much of a *row* a stroke filled, so it
// deleted every thin vertical line and kept every thick one at full strength.
const MIN_STROKE_PIXELS = 60;
// Two touching pixels belong to the same stroke while every channel is within
// this of the region's reference colour. Tight enough that neighbouring rainbow
// arcs stay separate.
const STROKE_COLOUR_TOLERANCE = 40;
// ...but not, on its own, loose enough to ride out the tablet's anti-aliasing,
// which the comment here used to claim it was. A half-covered edge pixel of a
// red stroke on a pale body is about eighty units per channel away from the
// solid interior, so the absolute test alone splits every high-contrast stroke
// into three regions: top fringe, interior, bottom fringe. Each fringe then
// draws its own height tier and its own colour, and now that a patch edge is a
// one-texel geometric wall it would draw its own wall too - a double step around
// everything the child paints.
//
// Anti-aliasing has a shape, though. A partially covered pixel is exactly
// body + coverage * (paint - body), so it lies on the ray from the body colour
// through the paint colour, differing only in length. Testing for that directly
// is what lets a fringe rejoin its own stroke.
const FRINGE_RAY_COS = Math.cos((12 * Math.PI) / 180);
// How far along the ray two colours must sit before one counts as a partial
// version of the other rather than a second deliberate colour. A child painting
// pink beside red is the case this protects: pink is genuinely on the ray from a
// pale body through red, but it arrives at nearly full strength, so it stays its
// own stroke. Anything dimmer than this - or, growing outward from a fringe that
// happened to seed first, anything correspondingly brighter - is coverage.
const FRINGE_COVERAGE_BAND = 0.8;
// Height tiers kept close together so remaining steps stay subtle.
const STROKE_HEIGHT_TIERS = [0.55, 0.7, 0.85, 0.95, 1.0];
// How near the edge of the drawing paint must come before it counts as the child
// colouring that pole. Four percent of 512 is the top twenty rows, where the
// tablet's circular clip has narrowed the drawable width to about a fifth of the
// disc - so paint landing there was aimed at the very top, not left there by a
// stroke that happens to be high up.
const POLE_REACH_FRACTION = 0.04;

function readDisc(image) {
  const canvas = document.createElement('canvas');
  const size = Math.min(image.width || 512, image.height || 512, 512);
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, size, size);
  return { data: context.getImageData(0, 0, size, size).data, size };
}

/**
 * Find the child's strokes: runs of touching paint of about one colour.
 *
 * Everything downstream needs a stroke as a whole object - its extent, which
 * way it runs, where its middle is at each height - because those are what
 * decide how it wraps. Working a row at a time cannot recover any of them.
 */
export function labelStrokes(disc, bodyRgb) {
  const { data, size } = disc;
  const total = size * size;
  const labels = new Int32Array(total).fill(-1);

  const isPaint = (index) => {
    const offset = index * 4;
    const dr = data[offset] - bodyRgb[0];
    const dg = data[offset + 1] - bodyRgb[1];
    const db = data[offset + 2] - bodyRgb[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) >= PAINT_MATCH_DISTANCE;
  };

  const strokes = [];
  const stack = new Int32Array(total);
  const members = new Int32Array(total);

  for (let seed = 0; seed < total; seed += 1) {
    if (labels[seed] >= 0 || !isPaint(seed)) continue;

    // The index this region will take if it turns out to be big enough. If it
    // does not, the labels are rolled back and the same index is reused.
    const index = strokes.length;
    const seedR = data[seed * 4];
    const seedG = data[seed * 4 + 1];
    const seedB = data[seed * 4 + 2];

    // The colour every candidate is judged against. Starts at the seed and
    // climbs toward the most solid pixel the region finds - see the note where
    // it is updated.
    let referenceR = seedR;
    let referenceG = seedG;
    let referenceB = seedB;
    let referenceLength = Math.hypot(
      seedR - bodyRgb[0],
      seedG - bodyRgb[1],
      seedB - bodyRgb[2],
    );

    let top = 0;
    let count = 0;
    stack[top += 1] = seed;
    labels[seed] = index;

    let minX = size;
    let maxX = -1;
    let minY = size;
    let maxY = -1;
    const sumX = new Float64Array(size);
    const perRow = new Int32Array(size);

    // One colour for the whole region, weighted toward its interior.
    //
    // A stroke used to be painted texel by texel out of the drawing, which
    // carried the tablet's anti-aliasing onto the planet: every patch faded into
    // the body over two or three texels. That was survivable while the edge was
    // a soft twenty-two texel ramp with darkening painted over it. It is not
    // survivable now - the bevel is a one-texel geometric wall, so a blurred
    // colour edge sits visibly adrift of the hard shading edge beside it, and
    // the reference look's flat poster-paint patches turn back into smudges.
    //
    // Weighting by distance from the body colour is what makes the average
    // honest. A plain mean over the region drags toward the body, because the
    // blended rim pixels are half body colour and a thin stroke is mostly rim.
    // The seed pixel is no better: flood fill seeds in raster order, so it lands
    // on the region's top edge, which is exactly the anti-aliased part.
    let weightedR = 0;
    let weightedG = 0;
    let weightedB = 0;
    let colourWeight = 0;
    let plainR = 0;
    let plainG = 0;
    let plainB = 0;

    while (top > 0) {
      const point = stack[(top -= 1) + 1];
      members[count += 1] = point;
      const y = (point / size) | 0;
      const x = point - y * size;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX[y] += x;
      perRow[y] += 1;

      const memberOffset = point * 4;
      const memberR = data[memberOffset];
      const memberG = data[memberOffset + 1];
      const memberB = data[memberOffset + 2];
      plainR += memberR;
      plainG += memberG;
      plainB += memberB;
      const fromBody = Math.sqrt(
        (memberR - bodyRgb[0]) ** 2 + (memberG - bodyRgb[1]) ** 2 + (memberB - bodyRgb[2]) ** 2,
      );
      // A fully blended rim pixel sits right on the paint threshold and so
      // contributes nothing; a solid interior pixel contributes in proportion to
      // how solid it is.
      const weight = Math.max(0, fromBody - PAINT_MATCH_DISTANCE);
      weightedR += memberR * weight;
      weightedG += memberG * weight;
      weightedB += memberB * weight;
      colourWeight += weight;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= size) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= size) continue;
          const neighbour = ny * size + nx;
          if (labels[neighbour] >= 0 || !isPaint(neighbour)) continue;
          const offset = neighbour * 4;
          const nr = data[offset];
          const ng = data[offset + 1];
          const nb = data[offset + 2];

          let joins =
            Math.max(Math.abs(nr - referenceR), Math.abs(ng - referenceG), Math.abs(nb - referenceB)) <=
            STROKE_COLOUR_TOLERANCE;

          // Vector from the body colour, which is the axis anti-aliasing slides
          // along. Length is coverage; direction is which paint it is.
          const nvr = nr - bodyRgb[0];
          const nvg = ng - bodyRgb[1];
          const nvb = nb - bodyRgb[2];
          const neighbourLength = Math.sqrt(nvr * nvr + nvg * nvg + nvb * nvb);

          if (!joins && neighbourLength > 1e-6 && referenceLength > 1e-6) {
            const rvr = referenceR - bodyRgb[0];
            const rvg = referenceG - bodyRgb[1];
            const rvb = referenceB - bodyRgb[2];
            const alignment = (nvr * rvr + nvg * rvg + nvb * rvb) / (neighbourLength * referenceLength);
            const coverage = neighbourLength / referenceLength;
            joins =
              alignment >= FRINGE_RAY_COS &&
              (coverage <= FRINGE_COVERAGE_BAND || coverage >= 1 / FRINGE_COVERAGE_BAND);
          }
          if (!joins) continue;

          labels[neighbour] = index;
          stack[top += 1] = neighbour;

          // Flood fill seeds in raster order, so a region's first pixel is on
          // its top edge - which for an anti-aliased stroke is the fringe, not
          // the paint. Tracking the most saturated member seen keeps every
          // later comparison against the colour the child actually chose rather
          // than against a half-covered sample of it.
          if (neighbourLength > referenceLength) {
            referenceR = nr;
            referenceG = ng;
            referenceB = nb;
            referenceLength = neighbourLength;
          }
        }
      }
    }

    if (count < MIN_STROKE_PIXELS) {
      for (let i = 1; i <= count; i += 1) labels[members[i]] = -1;
      continue;
    }

    // Which way the stroke runs decides what gets stretched around the planet.
    // A wide stroke is walked left to right; a tall one is walked top to
    // bottom, which is what turns a vertical line into a spiral instead of
    // letting it own every latitude it passes through.
    const horizontal = maxX - minX >= maxY - minY;
    const centreX = new Float32Array(size);
    for (let y = minY; y <= maxY; y += 1) {
      centreX[y] = perRow[y] ? sumX[y] / perRow[y] : (minX + maxX) / 2;
    }

    // Falls back down a ladder rather than trusting one estimator: the weighted
    // interior average, then the plain average if every pixel sat on the paint
    // threshold, then the seed if the region somehow had no members at all.
    const regionColour = colourWeight > 0
      ? [
          Math.round(weightedR / colourWeight),
          Math.round(weightedG / colourWeight),
          Math.round(weightedB / colourWeight),
        ]
      : count > 0
        ? [Math.round(plainR / count), Math.round(plainG / count), Math.round(plainB / count)]
        : [seedR, seedG, seedB];

    strokes.push({
      index,
      colour: regionColour,
      minX,
      maxX,
      minY,
      maxY,
      horizontal,
      centreX,
    });
  }

  // How solid each painted pixel is, as a fraction of its own region's colour.
  // This is the tablet's anti-aliasing read as coverage rather than discarded:
  // a rim pixel half blended into the body is half covered, and that is exactly
  // what the relief pass needs to place a patch edge between texel centres.
  const coverage = new Float32Array(total);
  const solidLength = new Map();
  for (const stroke of strokes) {
    solidLength.set(
      stroke.index,
      Math.max(
        1e-6,
        Math.hypot(
          stroke.colour[0] - bodyRgb[0],
          stroke.colour[1] - bodyRgb[1],
          stroke.colour[2] - bodyRgb[2],
        ),
      ),
    );
  }
  for (let i = 0; i < total; i += 1) {
    const label = labels[i];
    if (label < 0) continue;
    const offset = i * 4;
    const fromBody = Math.hypot(
      data[offset] - bodyRgb[0],
      data[offset + 1] - bodyRgb[1],
      data[offset + 2] - bodyRgb[2],
    );
    coverage[i] = Math.min(1, fromBody / solidLength.get(label));
  }

  return { labels, strokes, coverage };
}

/**
 * Wrap every stroke around the planet, keeping its shape.
 *
 * Sampled backwards - for each texel of the finished map, work out which pixel
 * of the drawing it came from - because the forward direction leaves holes. A
 * stroke stretched from 200 drawing pixels to 512 texture columns visits only
 * 200 of them going forwards, and the result is a line combed into vertical
 * stripes with the body colour showing between them.
 */
export function projectStrokes(disc, bodyRgb, labels, strokes, sourceCoverage = null) {
  // The drawing's pixels are not read here any more, only its labelling - the
  // colour of a texel is decided by which region owns it.
  const { size } = disc;
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const colour = new Uint8ClampedArray(texels * 3);
  const owner = new Int32Array(texels).fill(-1);
  const coverage = new Float32Array(texels);

  for (let i = 0; i < texels; i += 1) {
    colour[i * 3] = bodyRgb[0];
    colour[i * 3 + 1] = bodyRgb[1];
    colour[i * 3 + 2] = bodyRgb[2];
  }

  for (let v = 0; v < TEXTURE_HEIGHT; v += 1) {
    // v runs north pole to south pole and the disc's rows run top to bottom, so
    // this is a straight proportional read with no flip.
    const y = Math.min(size - 1, Math.round(((v + 0.5) / TEXTURE_HEIGHT) * (size - 1)));

    for (const stroke of strokes) {
      if (y < stroke.minY || y > stroke.maxY) continue;
      const acrossSpan = Math.max(1, stroke.maxX - stroke.minX);
      const downSpan = Math.max(1, stroke.maxY - stroke.minY);
      const along = (y - stroke.minY) / downSpan;

      for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
        const texel = v * TEXTURE_WIDTH + u;
        // First stroke to claim a texel keeps it. Later strokes are underneath.
        if (owner[texel] >= 0) continue;
        const t = u / TEXTURE_WIDTH;

        let x;
        if (stroke.horizontal) {
          x = Math.round(stroke.minX + t * acrossSpan);
        } else {
          // A tall stroke's longitude comes from how far down it we are, so it
          // winds once around the planet as it descends. Its own width is kept
          // as an offset either side of that, wrapped at the seam.
          let offset = t - along + 0.5;
          offset -= Math.floor(offset);
          x = Math.round(stroke.centreX[y] + (offset - 0.5) * size);
        }

        if (x < 0 || x >= size) continue;
        const source = y * size + x;
        if (labels[source] !== stroke.index) continue;

        // The region's one colour, not the drawing pixel underneath. The pixel
        // is what carried the tablet's anti-aliased fringe onto the planet; the
        // region colour makes the patch flat right up to the bevel wall, which
        // is where the reference look's hard colour boundaries come from.
        colour[texel * 3] = stroke.colour[0];
        colour[texel * 3 + 1] = stroke.colour[1];
        colour[texel * 3 + 2] = stroke.colour[2];
        owner[texel] = stroke.index;
        coverage[texel] = sourceCoverage ? sourceCoverage[source] : 1;
      }
    }
  }

  return { colour, owner, coverage };
}

/**
 * Paint that reaches a pole owns the whole cap - and only then.
 *
 * A child who draws right over the top of the disc means the top of their
 * planet, and the circular clip leaves a sliver of untouched canvas above their
 * apex that would otherwise arrive as a ring of background sitting on the pole.
 * Carrying that colour up closes it.
 *
 * Both ends are gated on the paint actually getting there. Extending the topmost
 * colour unconditionally - which is what this did first, inherited from the
 * per-row version - is right for a stroke drawn over the pole and wrong for
 * everything else: a wavy line a third of the way down the drawing turned the
 * entire northern hemisphere into a cap of its colour, which is not what the
 * child drew. Unpainted canvas above or below a drawing is a pale pole, and it
 * is meant to show.
 */
function fillPoles(colour, owner, disc, bodyRgb) {
  const rowOwned = (v) => {
    for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
      if (owner[v * TEXTURE_WIDTH + u] >= 0) return true;
    }
    return false;
  };

  const averageOf = (v) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    let source = -1;
    for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
      const texel = v * TEXTURE_WIDTH + u;
      if (owner[texel] < 0) continue;
      r += colour[texel * 3];
      g += colour[texel * 3 + 1];
      b += colour[texel * 3 + 2];
      n += 1;
      source = owner[texel];
    }
    return n ? { rgb: [r / n, g / n, b / n], source } : null;
  };

  // Fills only what the stroke did not already claim. A stroke drawn right over
  // the top reaches row 0 but only across the longitudes it happens to cross, so
  // overwriting whole rows would erase the stroke itself while leaving the gaps
  // beside it - the cap has to close around it, not replace it.
  const closeGaps = (fromRow, toRow, cap) => {
    for (let v = Math.max(0, fromRow); v <= Math.min(TEXTURE_HEIGHT - 1, toRow); v += 1) {
      for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
        const texel = v * TEXTURE_WIDTH + u;
        if (owner[texel] >= 0) continue;
        colour[texel * 3] = cap.rgb[0];
        colour[texel * 3 + 1] = cap.rgb[1];
        colour[texel * 3 + 2] = cap.rgb[2];
        // The cap belongs to the stroke that reached it, so it is raised with
        // that stroke rather than sitting flat while the paint beside it stands
        // proud - which would put a visible step right at the pole.
        owner[texel] = cap.source;
      }
    }
  };

  // Whether the child's paint actually lands in a band of the drawing, read off
  // the drawing rather than off the projected map: the map has already been
  // stretched around the planet, so a stroke's own extent is clearer at source.
  const { data, size } = disc;
  const paintWithin = (fromRow, toRow) => {
    for (let y = Math.max(0, fromRow); y <= Math.min(size - 1, toRow); y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const dr = data[offset] - bodyRgb[0];
        const dg = data[offset + 1] - bodyRgb[1];
        const db = data[offset + 2] - bodyRgb[2];
        if (Math.sqrt(dr * dr + dg * dg + db * db) >= PAINT_MATCH_DISTANCE) return true;
      }
    }
    return false;
  };

  let first = -1;
  let last = -1;
  for (let v = 0; v < TEXTURE_HEIGHT; v += 1) {
    if (!rowOwned(v)) continue;
    if (first < 0) first = v;
    last = v;
  }
  if (first < 0) return;

  const reach = Math.floor(size * POLE_REACH_FRACTION);
  // The same band measured on the finished map. The cap is closed across all of
  // it, not merely above the topmost paint, because paint that reaches the pole
  // rarely arrives across every longitude at once.
  const band = Math.ceil(TEXTURE_HEIGHT * POLE_REACH_FRACTION);

  if (paintWithin(0, reach)) {
    const cap = averageOf(first);
    if (cap) closeGaps(0, Math.max(first - 1, band), cap);
  }

  if (paintWithin(size - 1 - reach, size - 1)) {
    const cap = averageOf(last);
    if (cap) closeGaps(Math.min(last + 1, TEXTURE_HEIGHT - 1 - band), TEXTURE_HEIGHT - 1, cap);
  }
}

/**
 * Give each stroke its own thickness, with a rounded shoulder all the way
 * around its edge.
 *
 * Thickness comes from the colour itself, not from the order strokes appear in.
 * A child who paints the same green twice gets the same green thickness both
 * times, and the same drawing renders identically every time it loads - neither
 * is true of a counter that increments down the planet.
 *
 * The shoulder is a real two-dimensional distance to the nearest unpainted
 * texel, so the end of a stroke is bevelled exactly like its sides. The row
 * profile this replaced could only bevel the top and bottom of a band, which
 * was invisibly correct while every stroke ran the whole way round and wrong
 * the moment one had ends.
 */
function strokeRelief(owner, strokes, coverage) {
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const tierOf = new Map();
  for (const stroke of strokes) {
    const key =
      (Math.round(stroke.colour[0] / 24) * 121 +
        Math.round(stroke.colour[1] / 24) * 17 +
        Math.round(stroke.colour[2] / 24) * 7) %
      STROKE_HEIGHT_TIERS.length;
    tierOf.set(stroke.index, STROKE_HEIGHT_TIERS[key]);
  }

  // Distance from the edge of a patch inward. Seeded sub-texel from coverage
  // rather than from a binary in/out mask: a texel the paint only half fills has
  // its edge half a texel away, not a whole one, and quantising that to whole
  // texels is what turns a gently sloping band into a staircase once the bevel
  // is real geometry. Shared with the geometry builder, which needs the
  // identical field to put the wall in the identical place.
  const far = TEXTURE_WIDTH + TEXTURE_HEIGHT;
  const distance = new Float32Array(texels);
  for (let i = 0; i < texels; i += 1) {
    if (owner[i] < 0) {
      // Half a texel outside, not zero: the edge cannot be at an unpainted
      // texel's own centre. See edgeSeedDistance.
      distance[i] = edgeSeedDistance(0);
      continue;
    }
    const covered = coverage ? coverage[i] : 1;
    distance[i] = covered >= 0.999 ? far : edgeSeedDistance(covered);
  }
  relaxDistanceField(distance, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  const height = new Float32Array(texels);
  for (let i = 0; i < texels; i += 1) {
    if (owner[i] < 0) continue;
    const level = tierOf.get(owner[i]) ?? STROKE_HEIGHT_TIERS[0];
    height[i] = level * bevelProfile(distance[i], BEVEL_TEXELS);
  }

  // No shade field any more. Edge darkening used to be multiplied into the
  // albedo here, which is the wrong channel twice over: it dims the diffuse term
  // while clearcoat and environment reflection carry on at full strength over
  // the top, and it permanently muddies the flat colours the child chose. The
  // crease is an aoMap now, and the shoulder gets its shading from its own
  // normals instead of from a painted-on gradient.
  return { height, distance };
}

function buildEquirectangularCanvas(disc, bodyRgb) {
  const { labels, strokes, coverage: sourceCoverage } = labelStrokes(disc, bodyRgb);
  const { colour, owner, coverage } = projectStrokes(disc, bodyRgb, labels, strokes, sourceCoverage);
  fillPoles(colour, owner, disc, bodyRgb);
  const { height, distance } = strokeRelief(owner, strokes, coverage);

  const target = document.createElement('canvas');
  target.width = TEXTURE_WIDTH;
  target.height = TEXTURE_HEIGHT;
  const context = target.getContext('2d', { alpha: false });
  if (!context) return null;

  // Albedo is the child's colour and nothing else. Every bit of shading that
  // used to be baked in here now comes from geometry and the aoMap, which is
  // what lets the reference look's flat saturated patches actually read as flat
  // and saturated instead of as a colour with a gradient painted over it.
  const painted = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  for (let i = 0; i < TEXTURE_WIDTH * TEXTURE_HEIGHT; i += 1) {
    painted.data[i * 4] = colour[i * 3];
    painted.data[i * 4 + 1] = colour[i * 3 + 1];
    painted.data[i * 4 + 2] = colour[i * 3 + 2];
    painted.data[i * 4 + 3] = 255;
  }
  context.putImageData(painted, 0, 0);

  return { canvas: target, height, owner, distance, strokeCount: strokes.length };
}

/**
 * Turn the per-stroke thickness into the one map the material still reads.
 *
 * There is no height canvas here any more: the relief is in the vertices, so
 * writing it into a displacementMap as well would raise every patch twice. What
 * survives is roughness, because a raised pad is finished very slightly smoother
 * than the body - how a second coat behaves - and that keeps the two readable in
 * flat light, where relief alone disappears.
 */
function buildRoughnessCanvas(height) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  for (let i = 0; i < TEXTURE_WIDTH * TEXTURE_HEIGHT; i += 1) {
    // Raised pads are noticeably smoother (toy plastic / second coat of paint).
    const value = 230 - height[i] * 95;
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function hideSculptedGeometry(entity) {
  // strokeWrapGroup used to be here too. Nothing in the repo ever assigns it -
  // its two siblings have one assignment each - so it was hiding a property
  // that never existed.
  for (const key of ['sculptedArtworkGroup', 'areaFillProjectionGroup']) {
    const group = entity[key];
    if (group) group.visible = false;
  }
  if (entity.accentMesh) entity.accentMesh.visible = false;
  if (entity.accentEdgeMesh) entity.accentEdgeMesh.visible = false;
  entity.mesh.traverse((child) => {
    if (child === entity.mesh) return;
    if (child.userData?.kidsGalaxySculptedKidPatch) child.visible = false;
  });
}

function bodyColourOf(entity, disc) {
  if (typeof entity?.bodyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(entity.bodyColor)) {
    return [
      Number.parseInt(entity.bodyColor.slice(1, 3), 16),
      Number.parseInt(entity.bodyColor.slice(3, 5), 16),
      Number.parseInt(entity.bodyColor.slice(5, 7), 16),
    ];
  }
  // Older planets, stored before tablets sent body_color. The top-left pixel is
  // outside the circular clip the tablet applies, so no stroke can reach it.
  return [disc.data[0], disc.data[1], disc.data[2]];
}

function applySoftToySurface(entity, texture, renderer) {
  const image = texture?.image;
  if (!image || typeof document === 'undefined') return false;

  const disc = readDisc(image);
  if (!disc) return false;
  const bodyRgb = bodyColourOf(entity, disc);
  const built = buildEquirectangularCanvas(disc, bodyRgb);
  if (!built) return false;
  const roughnessCanvas = buildRoughnessCanvas(built.height);
  const aoCanvas = buildCreaseAoCanvas({
    owner: built.owner,
    distanceIn: built.distance,
    width: TEXTURE_WIDTH,
    height: TEXTURE_HEIGHT,
  });

  const map = new THREE.CanvasTexture(built.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.wrapS = THREE.RepeatWrapping;
  map.needsUpdate = true;

  // MeshPhysicalMaterial, not MeshStandardMaterial. Two reasons, and both
  // matter. The look asked for is a moulded painted toy, which needs a clearcoat
  // - the previous fully matte pass came back as "the plastic rendering is
  // lost", and it was, deliberately and wrongly. And ReferenceFinish sets
  // material.sheen and material.sheenColor, which exist on MeshPhysicalMaterial
  // and not on MeshStandardMaterial, so swapping the type down was quietly
  // taking properties away from a stage that expects them.
  // Tuned toward the soft high-gloss plastic / clay reference: lower base
  // roughness + stronger clearcoat with moderately sharp highlights.
  const material = new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.38,
    metalness: 0.0,
    clearcoat: 0.62,
    clearcoatRoughness: 0.45,
    // Soft studio wrap rather than a pinpoint glint.
    envMapIntensity: 0.85,
  });
  const environment = studioEnvironment(renderer);
  if (environment) material.envMap = environment;

  // No displacementMap and no bumpMap. Both are gone on purpose: the relief is
  // real geometry now, so a displacementMap would raise every patch a second
  // time, and a bumpMap reading the same field would fight normals that are
  // already correct. What they were compensating for - three.js not recomputing
  // normals after displacement, which left every raised patch shaded as if it
  // were still a smooth ball - is the thing the geometry build fixes.
  const reliefGeometry = buildBeveledReliefGeometry({
    heightField: built.height,
    fieldWidth: TEXTURE_WIDTH,
    fieldHeight: TEXTURE_HEIGHT,
    radius: bodyRadiusOf(entity),
    displacement: RELIEF_DISPLACEMENT,
    shapeGeometry: bodyShaperFor(entity),
  });
  if (reliefGeometry) attachReliefGeometry(entity, reliefGeometry);

  if (roughnessCanvas) {
    const roughness = new THREE.CanvasTexture(roughnessCanvas);
    roughness.wrapS = THREE.RepeatWrapping;
    roughness.needsUpdate = true;
    material.roughnessMap = roughness;
  }
  if (aoCanvas) {
    const occlusion = new THREE.CanvasTexture(aoCanvas);
    occlusion.wrapS = THREE.RepeatWrapping;
    // aoMap defaults to the second UV set. The relief map shares the body's
    // layout exactly, so send it back to uv - the geometry builder also
    // publishes uv1 as the same buffer, so either resolution path works.
    occlusion.channel = 0;
    occlusion.needsUpdate = true;
    material.aoMap = occlusion;
    material.aoMapIntensity = 1;
  }

  hideSculptedGeometry(entity);
  // Deliberately not touching castShadow/receiveShadow. Turning them on looked
  // right with two planets on a workstation and stalled a full twelve-planet
  // gallery: the key light is a point light, so every caster costs six shadow
  // faces per frame. The gallery running smoothly is worth more than contact
  // shadows, and the surviving stages set these where they want them.
  entity.mesh.material = material;
  material.userData.kidsGalaxySoftToySurface = true;
  material.userData.kidsGalaxyEmbossedBandCount = built.strokeCount;
  material.userData.kidsGalaxyDesignProjectionMode = 'strokes-wrapped-around-longitude';
  // The replaced material is left alone rather than disposed. Several stages
  // above hold a reference to it, and a disposed material still referenced is a
  // WebGL error on a real driver where software rendering shrugs it off - which
  // is exactly the kind of difference that does not show up in CI.
  return true;
}

export function installSoftToyPlanetSurface() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxySoftToyPlanetSurface) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function softToyTexture(texture) {
    previousApplyTexture.call(this, texture);
    try {
      // Resolved per planet rather than captured at install time: the render
      // pipeline is installed before the GalaxyScene exists, so there is no
      // renderer to capture yet. By the time a texture lands, there is.
      applySoftToySurface(this, texture, window.kidsGalaxy?.renderer);
    } catch (error) {
      // A planet that renders in the older style is far better than a planet
      // that does not render at all, so this never takes the projector down.
      // But it must not fail quietly either: swallowing the error leaves the
      // old appearance with no way to tell "this code is not running" from
      // "this code ran and did nothing", which is exactly the question asked
      // when a look change does not show up.
      console.error('Kids Galaxy soft-toy surface failed', this.id, error);
      window.kidsGalaxySoftToyFailures = window.kidsGalaxySoftToyFailures || [];
      window.kidsGalaxySoftToyFailures.push({ id: this.id, message: String(error) });
    }
  }

  softToyTexture.kidsGalaxySoftToyPlanetSurface = true;
  PlanetEntity.prototype.applyTexture = softToyTexture;
}
