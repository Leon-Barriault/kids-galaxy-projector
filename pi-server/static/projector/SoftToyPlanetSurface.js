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
 * Here the drawing becomes the planet's latitude profile. The body colour the
 * child chose is the sphere; every line they draw across the disc becomes a
 * band right around the planet at the height they drew it, so a rainbow drawn
 * as arcs from purple down to green arrives as a purple cap, then orange,
 * yellow and green rings, then a white south pole. Vertical order in the
 * drawing is vertical order on the planet, and longitude carries no information
 * on purpose - a stripe goes all the way round, which is what a child means by
 * drawing a stripe across a planet.
 *
 * Paint is raised off the body by the same mask that decides its colour, so a
 * band has the thickness of poster paint rather than of a slab: relief you read
 * at the terminator, never on the outline.
 */

// Bands are constant in longitude, so horizontal resolution buys nothing: eight
// columns of identical pixels stretch across the planet exactly as well as a
// thousand would. Keeping it narrow matters - at 1024 wide, three maps per
// planet across a full gallery of twelve was 72 MB of canvas and the same again
// in texture memory, all of it storing the same colour over and over.
const TEXTURE_WIDTH = 8;
const TEXTURE_HEIGHT = 512;
const BUMP_SCALE = 0.07;
// Radial relief for the bands, in world units against a body radius of 1.05, so
// roughly a 2.5% ridge - a moulded paint layer, not a slab standing off a ball.
const DISPLACEMENT_SCALE = 0.055;
// Body level in the height map. Not zero, so the sphere is not pulled inward
// where the child left it alone; displacementBias cancels it.
const BODY_HEIGHT = 40;
// How far from the body colour a pixel must sit, in RGB units, before it counts
// as paint. Edge softness is no longer needed alongside it: the shoulder is
// built per band from BAND_SHOULDER_ROWS rather than fading out of a per-pixel
// colour-distance ramp, which could only ever give every band the same edge.
const PAINT_MATCH_DISTANCE = 26;
// A row needs this fraction of painted pixels to become a band. Below it, the
// row is almost certainly an anti-aliased edge or a slip of the finger, and
// turning that into a ring right around the planet is very visible.
const MIN_ROW_COVERAGE = 0.02;
// Discrete thicknesses, as a fraction of DISPLACEMENT_SCALE. Coarse on purpose:
// three clearly different thicknesses read as deliberate layering, where a
// continuum reads as an uneven surface.
const BAND_HEIGHT_TIERS = [0.5, 0.75, 1.0];
// Rows of smoothstep at each end of a band, giving the pad a rounded shoulder
// instead of a cliff. This has to be read against the geometry, not just the
// texture: the body sphere has 72 height segments, so one vertex row spans about
// seven texture rows and an 8-row shoulder is quantised back into a single step.
// 22 rows is about three vertex rows - enough for the displacement to actually
// curve - and still only 8 degrees of latitude.
const BAND_SHOULDER_ROWS = 22;
// How much darker a band's rounded edge is than its flat top. This is the line
// the reference planets get from a pad sitting on a surface, and it is what
// makes relief legible at a glance rather than only at the terminator; real
// ambient occlusion would need a second UV set for a fraction of the effect.
const BAND_EDGE_SHADE = 0.78;
// Two rows belong to the same band while each channel is within this of the
// band's first row. Loose enough to ride out the tablet's anti-aliasing,
// tight enough that neighbouring rainbow colours never merge into one pad.
const BAND_COLOUR_TOLERANCE = 10;

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
 * Reduce the drawing to one colour per row: the latitude profile of the planet.
 *
 * A row the child left alone is body colour and stays body colour. A row they
 * painted takes the colour of the paint nearest the middle of the drawing at
 * that height, and then averages only the pixels in that row belonging to the
 * same band, so the band keeps its own colour instead of a blend.
 *
 * Nearest-to-centre is what makes a rainbow work. Drawn as nested arcs, a
 * horizontal line low down crosses every colour twice - purple out at the
 * edges, then orange, yellow, green in the middle - so averaging the row gives
 * brown and taking the most common colour gives whichever arc happens to be
 * widest there, which is the outermost one and inverts the order. Reading
 * inward-most instead recovers exactly the order the child sees down the middle
 * of their drawing: purple cap, then orange, yellow, green. It also does the
 * obvious thing for a plain stripe drawn anywhere across the disc.
 *
 * Coverage is returned per row but never fades the ring - the ring is drawn at
 * full strength all the way round. It only separates a real stroke from a
 * single stray pixel.
 */
function latitudeProfile(disc, bodyRgb) {
  const { data, size } = disc;
  const colours = new Float32Array(size * 3);
  const coverage = new Float32Array(size);
  const centre = (size - 1) / 2;

  const isPaint = (offset) => {
    const dr = data[offset] - bodyRgb[0];
    const dg = data[offset + 1] - bodyRgb[1];
    const db = data[offset + 2] - bodyRgb[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) >= PAINT_MATCH_DISTANCE;
  };

  for (let y = 0; y < size; y += 1) {
    let painted = 0;
    let innermost = -1;
    let innermostDistance = Infinity;
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      if (!isPaint(offset)) continue;
      painted += 1;
      const distance = Math.abs(x - centre);
      if (distance < innermostDistance) {
        innermostDistance = distance;
        innermost = offset;
      }
    }

    const fraction = painted / size;
    coverage[y] = fraction < MIN_ROW_COVERAGE ? 0 : fraction;
    if (coverage[y] === 0 || innermost < 0) {
      colours[y * 3] = bodyRgb[0];
      colours[y * 3 + 1] = bodyRgb[1];
      colours[y * 3 + 2] = bodyRgb[2];
      continue;
    }

    // Average across the rest of that band only, which cancels the tablet's
    // anti-aliasing without dragging in the neighbouring colours.
    const target = [data[innermost], data[innermost + 1], data[innermost + 2]];
    let members = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      if (!isPaint(offset)) continue;
      const dr = data[offset] - target[0];
      const dg = data[offset + 1] - target[1];
      const db = data[offset + 2] - target[2];
      if (Math.sqrt(dr * dr + dg * dg + db * db) > PAINT_MATCH_DISTANCE) continue;
      members += 1;
      r += data[offset];
      g += data[offset + 1];
      b += data[offset + 2];
    }
    colours[y * 3] = members ? r / members : target[0];
    colours[y * 3 + 1] = members ? g / members : target[1];
    colours[y * 3 + 2] = members ? b / members : target[2];
  }

  // The topmost band owns the cap. In a drawing like a rainbow the child arcs
  // paint over the top of the disc, leaving a sliver of untouched canvas above
  // the apex - but they read that arc as the top of the planet, and expect the
  // whole north pole in that colour rather than a purple stripe under a cap of
  // background. So paint that reaches the top of the drawing is carried up to
  // the pole. Nothing equivalent happens at the bottom on purpose: unpainted
  // canvas below the drawing is the white south pole they asked for.
  let firstPainted = -1;
  for (let y = 0; y < size; y += 1) {
    if (coverage[y] > 0) {
      firstPainted = y;
      break;
    }
  }
  if (firstPainted > 0) {
    for (let y = 0; y < firstPainted; y += 1) {
      colours[y * 3] = colours[firstPainted * 3];
      colours[y * 3 + 1] = colours[firstPainted * 3 + 1];
      colours[y * 3 + 2] = colours[firstPainted * 3 + 2];
      coverage[y] = coverage[firstPainted];
    }
  }

  return { colours, coverage, size, ...bandRelief(colours, coverage, size) };
}

/**
 * Give each band its own thickness, with a rounded shoulder where it meets what
 * is underneath.
 *
 * One uniform relief for all paint reads as a single sticker wrapped round the
 * ball. The look wanted is the opposite: separate pads laid on at different
 * thicknesses, each with a soft bevel, so a band's own edge catches light
 * against the band below it and not only against the body. That is most of what
 * makes those reference planets look moulded rather than printed.
 *
 * Thickness comes from the colour itself, not from the order the bands appear
 * in. A child who paints the same green twice gets the same green thickness both
 * times, and the same drawing renders identically every time it loads - neither
 * is true of a counter that increments down the planet. The tiers are coarse on
 * purpose: three clearly different thicknesses read as deliberate layering,
 * where a continuum reads as an uneven surface.
 */
function bandRelief(colours, coverage, size) {
  const heights = new Float32Array(size);
  const shade = new Float32Array(size).fill(1);
  const segments = [];

  let start = -1;
  for (let y = 0; y <= size; y += 1) {
    const painted = y < size && coverage[y] > 0;
    const sameAsStart =
      painted &&
      start >= 0 &&
      Math.abs(colours[y * 3] - colours[start * 3]) <= BAND_COLOUR_TOLERANCE &&
      Math.abs(colours[y * 3 + 1] - colours[start * 3 + 1]) <= BAND_COLOUR_TOLERANCE &&
      Math.abs(colours[y * 3 + 2] - colours[start * 3 + 2]) <= BAND_COLOUR_TOLERANCE;

    if (start >= 0 && !sameAsStart) {
      segments.push({ start, end: y - 1 });
      start = painted ? y : -1;
    } else if (start < 0 && painted) {
      start = y;
    }
  }

  for (const segment of segments) {
    const key =
      (Math.round(colours[segment.start * 3] / 24) * 121 +
        Math.round(colours[segment.start * 3 + 1] / 24) * 17 +
        Math.round(colours[segment.start * 3 + 2] / 24) * 7) %
      BAND_HEIGHT_TIERS.length;
    const level = BAND_HEIGHT_TIERS[key];
    const rows = segment.end - segment.start + 1;
    // A thin band cannot afford a full bevel at both ends without becoming a
    // ridge with no flat top, so the shoulder shrinks with the band.
    const shoulder = Math.max(1, Math.min(BAND_SHOULDER_ROWS, Math.floor(rows / 3)));
    // A shoulder only belongs where the band meets something. A band running to
    // row 0 or the last row is the pole itself, and bevelling there dents the
    // cap and darkens the exact centre of it - the drawing's topmost colour
    // covering the pole is the whole point of extending it up there.
    const bevelTop = segment.start > 0;
    const bevelBottom = segment.end < size - 1;
    for (let y = segment.start; y <= segment.end; y += 1) {
      const distances = [];
      if (bevelTop) distances.push(y - segment.start);
      if (bevelBottom) distances.push(segment.end - y);
      const fromEdge = distances.length ? Math.min(...distances) + 0.5 : shoulder;
      const t = Math.min(1, fromEdge / shoulder);
      // Smoothstep, so the shoulder is round rather than a chamfer.
      const eased = t * t * (3 - 2 * t);
      heights[y] = level * eased;
      shade[y] = BAND_EDGE_SHADE + (1 - BAND_EDGE_SHADE) * eased;
    }
  }

  return { heights, shade, bandCount: segments.length };
}

/**
 * Sweep the latitude profile around the planet.
 *
 * Longitude carries no information by design: a line drawn at some height goes
 * all the way round at that height, which is what a child means when they draw
 * a stripe across a planet. Rows map straight to latitude - the top of the disc
 * is the north pole, the bottom is the south pole - so the vertical order of
 * the drawing is the vertical order of the finished planet.
 */
function buildEquirectangularCanvas(disc, bodyRgb) {
  const profile = latitudeProfile(disc, bodyRgb);
  const target = document.createElement('canvas');
  target.width = TEXTURE_WIDTH;
  target.height = TEXTURE_HEIGHT;
  const context = target.getContext('2d', { alpha: false });
  if (!context) return null;
  const painted = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const rowHeight = new Float32Array(TEXTURE_HEIGHT);

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    // v runs north pole to south pole and the disc's rows run top to bottom, so
    // this is a straight proportional read with no flip.
    const source = Math.min(
      profile.size - 1,
      Math.max(0, Math.round(((y + 0.5) / TEXTURE_HEIGHT) * (profile.size - 1))),
    );
    const tone = profile.shade[source];
    const r = profile.colours[source * 3] * tone;
    const g = profile.colours[source * 3 + 1] * tone;
    const b = profile.colours[source * 3 + 2] * tone;
    rowHeight[y] = profile.heights[source];
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const offset = (y * TEXTURE_WIDTH + x) * 4;
      painted.data[offset] = r;
      painted.data[offset + 1] = g;
      painted.data[offset + 2] = b;
      painted.data[offset + 3] = 255;
    }
  }

  context.putImageData(painted, 0, 0);
  return { canvas: target, pixels: painted, rowHeight, bandCount: profile.bandCount };
}

/**
 * Turn the per-band thickness into the maps the material reads.
 *
 * Relief is decided by the profile, which knows where each band starts and ends
 * and how thick it should be. Re-deriving it here from colour distance - the
 * earlier approach - could only ever produce one thickness for all paint, and
 * had no idea where one band stopped and the next began.
 *
 * The roughness map comes off the same numbers: a raised pad is finished very
 * slightly smoother than the body, which is how a second coat behaves and keeps
 * the two readable in flat light where relief alone disappears.
 */
function buildPaintMaps(rowHeight) {
  const make = (write) => {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
    for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
      const value = write(rowHeight[y]);
      for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
        const offset = (y * TEXTURE_WIDTH + x) * 4;
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return canvas;
  };

  return {
    height: make((relief) => BODY_HEIGHT + relief * (255 - BODY_HEIGHT)),
    roughness: make((relief) => 245 - relief * 55),
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
  // the wrong rectangle, which looks like the galaxy freezing a moment after
  // the planets land rather than like a state bug. Snapshot capture already
  // brackets its readback this way; this does the same.
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
  const maps = buildPaintMaps(built.rowHeight);

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
  const material = new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.52,
    metalness: 0.0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.38,
    // Broad and soft rather than a pinpoint glint: a toy's coat, not glass.
    envMapIntensity: 0.7,
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
    // round, so paint reads as printed on rather than laid on. Displacing the
    // band outward puts the ridge back on the outline where the eye checks for
    // it. The band mask is a function of latitude alone, so this costs one extra
    // texture read per vertex and nothing at all per pixel.
    material.displacementMap = height;
    material.displacementScale = DISPLACEMENT_SCALE;
    // The map stores body at BODY_HEIGHT/255 rather than 0, so cancel that out:
    // without the bias the whole planet inflates and the bands do not stand
    // proud of anything.
    material.displacementBias = -(BODY_HEIGHT / 255) * DISPLACEMENT_SCALE;

    // Bump on the same mask keeps the band edge crisp between the sphere's
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
  // faces per frame, and the projector went from animating to a still image a
  // second after the planets landed. The gallery running smoothly is worth more
  // than contact shadows, and the surviving stages set these where they want them.
  entity.mesh.material = material;
  material.userData.kidsGalaxySoftToySurface = true;
  material.userData.kidsGalaxyEmbossedBandCount = built.bandCount;
  material.userData.kidsGalaxyDesignProjectionMode = 'drawing-rows-as-latitude-bands';
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
      console.warn('Kids Galaxy soft-toy surface unavailable', error);
    }
  }

  softToyTexture.kidsGalaxySoftToyPlanetSurface = true;
  PlanetEntity.prototype.applyTexture = softToyTexture;
}
