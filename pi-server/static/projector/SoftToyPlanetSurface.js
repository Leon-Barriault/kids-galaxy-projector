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

const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 512;
const BUMP_SCALE = 0.045;
// How far from the body colour a pixel must sit before it counts as paint, and
// over what distance that judgement fades in. Both in RGB units.
const PAINT_MATCH_DISTANCE = 26;
const PAINT_EDGE_SOFTNESS = 34;
// A row needs this fraction of painted pixels to become a band. Below it, the
// row is almost certainly an anti-aliased edge or a slip of the finger, and
// turning that into a ring right around the planet is very visible.
const MIN_ROW_COVERAGE = 0.02;

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

  return { colours, coverage, size };
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
  const rowCoverage = new Float32Array(TEXTURE_HEIGHT);

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    // v runs north pole to south pole and the disc's rows run top to bottom, so
    // this is a straight proportional read with no flip.
    const source = Math.min(
      profile.size - 1,
      Math.max(0, Math.round(((y + 0.5) / TEXTURE_HEIGHT) * (profile.size - 1))),
    );
    const r = profile.colours[source * 3];
    const g = profile.colours[source * 3 + 1];
    const b = profile.colours[source * 3 + 2];
    rowCoverage[y] = profile.coverage[source];
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const offset = (y * TEXTURE_WIDTH + x) * 4;
      painted.data[offset] = r;
      painted.data[offset + 1] = g;
      painted.data[offset + 2] = b;
      painted.data[offset + 3] = 255;
    }
  }

  context.putImageData(painted, 0, 0);
  return { canvas: target, pixels: painted, rowCoverage };
}

/**
 * Separate what the child painted from the ball they painted it on.
 *
 * The tablet fills the whole square with the chosen body colour and then clips
 * strokes to the circle, so "is this pixel paint" is answerable exactly: it is
 * paint when it differs from that body colour. Encoding that as relief is what
 * makes the two read as different things - paint sits on the body, catching
 * light along its edges, instead of being printed flat into it.
 *
 * Returns a height map and a roughness map from the same mask. Paint is raised
 * and very slightly less rough than the body, which is how a second coat
 * actually behaves, and the difference survives even in flat lighting where
 * relief alone would vanish.
 */
function buildPaintMaps(painted, bodyRgb) {
  const count = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const mask = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const dr = painted.data[offset] - bodyRgb[0];
    const dg = painted.data[offset + 1] - bodyRgb[1];
    const db = painted.data[offset + 2] - bodyRgb[2];
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    // Ramp rather than a hard threshold: anti-aliased stroke edges arrive as
    // intermediate colours, and a step function turns them into jagged relief.
    mask[index] = Math.min(1, Math.max(0, (distance - PAINT_MATCH_DISTANCE) / PAINT_EDGE_SOFTNESS));
  }

  const make = (write) => {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
    for (let index = 0; index < count; index += 1) {
      const value = write(mask[index]);
      const offset = index * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  };

  return {
    height: make((paint) => 40 + paint * 215),
    roughness: make((paint) => 245 - paint * 55),
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

  const generator = new THREE.PMREMGenerator(renderer);
  generator.compileEquirectangularShader();
  sharedEnvironment = generator.fromEquirectangular(source).texture;
  generator.dispose();
  source.dispose();
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
  const maps = buildPaintMaps(built.pixels, bodyRgb);

  const map = new THREE.CanvasTexture(built.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.wrapS = THREE.RepeatWrapping;
  map.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map,
    // Matte. The single thing that most reads as cheap plastic is a tight
    // specular highlight, so there is no clearcoat and no metalness here.
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.55,
  });
  const environment = studioEnvironment(renderer);
  if (environment) material.envMap = environment;
  if (maps.height) {
    const bump = new THREE.CanvasTexture(maps.height);
    bump.wrapS = THREE.RepeatWrapping;
    bump.needsUpdate = true;
    material.bumpMap = bump;
    material.bumpScale = BUMP_SCALE;
  }
  if (maps.roughness) {
    const roughness = new THREE.CanvasTexture(maps.roughness);
    roughness.wrapS = THREE.RepeatWrapping;
    roughness.needsUpdate = true;
    material.roughnessMap = roughness;
  }

  hideSculptedGeometry(entity);
  const previous = entity.mesh.material;
  entity.mesh.material = material;
  entity.mesh.castShadow = true;
  entity.mesh.receiveShadow = true;
  material.userData.kidsGalaxySoftToySurface = true;
  material.userData.kidsGalaxyDesignProjectionMode = 'drawing-rows-as-latitude-bands';
  if (previous && previous !== material) previous.dispose();
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
