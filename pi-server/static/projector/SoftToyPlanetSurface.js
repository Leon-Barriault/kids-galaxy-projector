import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

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
 * stroke has the thickness of poster paint rather than of a slab: relief you
 * read at the terminator, never on the outline.
 */

// Longitude carries information now, so the texture can no longer be eight
// columns of the same colour repeated. 512x256 is the smallest equirectangular
// map that holds a 512px drawing without visible stair-stepping along a
// diagonal stroke. At three maps per planet it is about 1.5 MB across a gallery
// of twelve - the 1024-wide map the old note warned about would be 72 MB.
const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;
const BUMP_SCALE = 0.09;
// Radial relief for the paint. Slightly reduced so discrete height tiers
// do not read as hard terraces from oblique angles, while still giving
// clear molded volume.
const DISPLACEMENT_SCALE = 0.075;
// Body level in the height map. Not zero, so the sphere is not pulled inward
// where the child left it alone; displacementBias cancels it.
const BODY_HEIGHT = 40;
// How far from the body colour a pixel must sit, in RGB units, before it counts
// as paint.
const PAINT_MATCH_DISTANCE = 26;
// A run of connected paint this small is anti-aliasing or a slip of the finger
// rather than a stroke. This replaces the old per-row coverage fraction, which
// measured the wrong thing: it asked how much of a *row* a stroke filled, so it
// deleted every thin vertical line and kept every thick one at full strength.
const MIN_STROKE_PIXELS = 60;
// Two touching pixels belong to the same stroke while every channel is within
// this of the pixel the region grew from. Loose enough to ride out the tablet's
// anti-aliasing, tight enough that neighbouring rainbow arcs stay separate.
const STROKE_COLOUR_TOLERANCE = 40;
// Finer height tiers reduce visible terracing while still giving variety
// between strokes of different colours.
const STROKE_HEIGHT_TIERS = [0.35, 0.55, 0.75, 0.9, 1.0];
// Wider shoulders so the steps between tiers blend into soft rounded fillets
// closer to the continuous clay look of the reference images.
const SHOULDER_TEXELS = 16;
// How much darker a stroke's rounded edge is than its flat top. Stronger
// darkening makes the embossed pads read clearly even under soft studio light.
const STROKE_EDGE_SHADE = 0.70;
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
function labelStrokes(disc, bodyRgb) {
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

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= size) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= size) continue;
          const neighbour = ny * size + nx;
          if (labels[neighbour] >= 0 || !isPaint(neighbour)) continue;
          const offset = neighbour * 4;
          const spread = Math.max(
            Math.abs(data[offset] - seedR),
            Math.abs(data[offset + 1] - seedG),
            Math.abs(data[offset + 2] - seedB),
          );
          if (spread > STROKE_COLOUR_TOLERANCE) continue;
          labels[neighbour] = index;
          stack[top += 1] = neighbour;
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

    strokes.push({
      index,
      colour: [seedR, seedG, seedB],
      minX,
      maxX,
      minY,
      maxY,
      horizontal,
      centreX,
    });
  }

  return { labels, strokes };
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
function projectStrokes(disc, bodyRgb, labels, strokes) {
  const { data, size } = disc;
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const colour = new Uint8ClampedArray(texels * 3);
  const owner = new Int32Array(texels).fill(-1);

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

        colour[texel * 3] = data[source * 4];
        colour[texel * 3 + 1] = data[source * 4 + 1];
        colour[texel * 3 + 2] = data[source * 4 + 2];
        owner[texel] = stroke.index;
      }
    }
  }

  return { colour, owner };
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
function strokeRelief(owner, strokes) {
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

  // Chamfer distance from unpainted texels inward. Longitude wraps, so the
  // horizontal neighbours wrap with it and a stroke crossing the seam is not
  // bevelled down the middle of its back. Latitude clamps instead: the row
  // above the north pole is the pole, not empty space, and treating it as an
  // edge dents and darkens the exact centre of the cap.
  const far = TEXTURE_WIDTH + TEXTURE_HEIGHT;
  const distance = new Float32Array(texels);
  for (let i = 0; i < texels; i += 1) distance[i] = owner[i] >= 0 ? far : 0;

  const relax = (v, u, dv, du) => {
    const nv = v + dv;
    if (nv < 0 || nv >= TEXTURE_HEIGHT) return;
    const nu = (u + du + TEXTURE_WIDTH) % TEXTURE_WIDTH;
    const candidate = distance[nv * TEXTURE_WIDTH + nu] + (dv && du ? 1.414 : 1);
    const texel = v * TEXTURE_WIDTH + u;
    if (candidate < distance[texel]) distance[texel] = candidate;
  };

  // Two sweeps each way; the second lets a distance that had to travel around
  // the seam finish propagating.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let v = 0; v < TEXTURE_HEIGHT; v += 1) {
      for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
        relax(v, u, -1, 0);
        relax(v, u, -1, -1);
        relax(v, u, -1, 1);
        relax(v, u, 0, -1);
      }
    }
    for (let v = TEXTURE_HEIGHT - 1; v >= 0; v -= 1) {
      for (let u = TEXTURE_WIDTH - 1; u >= 0; u -= 1) {
        relax(v, u, 1, 0);
        relax(v, u, 1, 1);
        relax(v, u, 1, -1);
        relax(v, u, 0, 1);
      }
    }
  }

  const height = new Float32Array(texels);
  const shade = new Float32Array(texels).fill(1);
  for (let i = 0; i < texels; i += 1) {
    if (owner[i] < 0) continue;
    const level = tierOf.get(owner[i]) ?? STROKE_HEIGHT_TIERS[0];
    const t = Math.min(1, distance[i] / SHOULDER_TEXELS);
    // Smoothstep, so the shoulder is round rather than a chamfer.
    const eased = t * t * (3 - 2 * t);
    height[i] = level * eased;
    shade[i] = STROKE_EDGE_SHADE + (1 - STROKE_EDGE_SHADE) * eased;
  }

  return { height, shade };
}

function buildEquirectangularCanvas(disc, bodyRgb) {
  const { labels, strokes } = labelStrokes(disc, bodyRgb);
  const { colour, owner } = projectStrokes(disc, bodyRgb, labels, strokes);
  fillPoles(colour, owner, disc, bodyRgb);
  const { height, shade } = strokeRelief(owner, strokes);

  const target = document.createElement('canvas');
  target.width = TEXTURE_WIDTH;
  target.height = TEXTURE_HEIGHT;
  const context = target.getContext('2d', { alpha: false });
  if (!context) return null;

  const painted = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  for (let i = 0; i < TEXTURE_WIDTH * TEXTURE_HEIGHT; i += 1) {
    const tone = shade[i];
    painted.data[i * 4] = colour[i * 3] * tone;
    painted.data[i * 4 + 1] = colour[i * 3 + 1] * tone;
    painted.data[i * 4 + 2] = colour[i * 3 + 2] * tone;
    painted.data[i * 4 + 3] = 255;
  }
  context.putImageData(painted, 0, 0);

  return { canvas: target, height, strokeCount: strokes.length };
}

/**
 * Turn the per-stroke thickness into the maps the material reads.
 *
 * The roughness map comes off the same numbers: a raised pad is finished very
 * slightly smoother than the body, which is how a second coat behaves and keeps
 * the two readable in flat light where relief alone disappears.
 */
function buildPaintMaps(height) {
  const make = (write) => {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
    for (let i = 0; i < TEXTURE_WIDTH * TEXTURE_HEIGHT; i += 1) {
      const value = write(height[i]);
      image.data[i * 4] = value;
      image.data[i * 4 + 1] = value;
      image.data[i * 4 + 2] = value;
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  };

  return {
    height: make((relief) => BODY_HEIGHT + relief * (255 - BODY_HEIGHT)),
    // Raised pads are noticeably smoother (toy plastic / second coat of paint).
    roughness: make((relief) => 230 - relief * 95),
  };
}

/**
 * A small studio-in-a-can: one soft gradient, prefiltered into an environment
 * map and shared by every planet.
 *
 * The scene's own rig is two dim ambient lights plus a point light at the sun,
 * which is physically honest and makes a matte ball read as a dark disc with a
 * bright edge - space, not a toy on a shelf. Image-based light is what supplies
 * the gentle wrap-around that a painted object needs to look solid, and one
 * prefiltered texture costs a fraction of the fill lights it replaces.
 */
let sharedEnvironment = null;

function studioEnvironment(renderer) {
  if (sharedEnvironment || !renderer) return sharedEnvironment;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  // Cool sky over a warm bounce, the way daylight falls on a table.
  const gradient = context.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#dfe9ff');
  gradient.addColorStop(0.55, '#9fb0cc');
  gradient.addColorStop(1, '#6b5f52');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  source.needsUpdate = true;

  // Prefiltering renders into its own targets, so it moves the renderer's
  // target, viewport and scissor out from under whatever set them. This
  // projector scales its internal resolution, so those are not defaults to be
  // restored by luck - leaving them changed means every later frame draws into
  // the wrong rectangle.
  const previousTarget = renderer.getRenderTarget();
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  try {
    const generator = new THREE.PMREMGenerator(renderer);
    generator.compileEquirectangularShader();
    sharedEnvironment = generator.fromEquirectangular(source).texture;
    generator.dispose();
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    source.dispose();
  }
  return sharedEnvironment;
}

function hideSculptedGeometry(entity) {
  for (const key of ['sculptedArtworkGroup', 'areaFillProjectionGroup', 'strokeWrapGroup']) {
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
  const maps = buildPaintMaps(built.height);

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
    clearcoatRoughness: 0.28,
    // Soft studio wrap rather than a pinpoint glint.
    envMapIntensity: 0.85,
  });
  const environment = studioEnvironment(renderer);
  if (environment) material.envMap = environment;
  if (maps.height) {
    const height = new THREE.CanvasTexture(maps.height);
    height.wrapS = THREE.RepeatWrapping;
    height.needsUpdate = true;

    // Real geometry, not only shading. The sculpted pipeline this replaced did
    // emboss the child's marks, and losing that lost the moulded look the
    // reference images have - a bump map alone leaves the silhouette perfectly
    // round, so paint reads as printed on rather than laid on.
    material.displacementMap = height;
    material.displacementScale = DISPLACEMENT_SCALE;
    // The map stores body at BODY_HEIGHT/255 rather than 0, so cancel that out:
    // without the bias the whole planet inflates and the paint does not stand
    // proud of anything.
    material.displacementBias = -(BODY_HEIGHT / 255) * DISPLACEMENT_SCALE;

    // Bump on the same mask keeps the stroke edge crisp between the sphere's
    // latitude rows, which are 2.5 degrees apart and would otherwise stair-step.
    material.bumpMap = height;
    material.bumpScale = BUMP_SCALE;
  }
  if (maps.roughness) {
    const roughness = new THREE.CanvasTexture(maps.roughness);
    roughness.wrapS = THREE.RepeatWrapping;
    roughness.needsUpdate = true;
    material.roughnessMap = roughness;
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
