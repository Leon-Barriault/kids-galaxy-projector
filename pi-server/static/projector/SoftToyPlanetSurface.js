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
 * Here the drawing stays a picture. The disc is read as an orthographic view of
 * the planet's front - which is what a child means when they colour a circle -
 * and resampled into an equirectangular texture. The back hemisphere mirrors
 * the front, so the rim pixels agree across the silhouette and the seam is
 * invisible while the composition stays recognisable from the front.
 *
 * A matching luminance-derived bump gives paint the thickness of poster paint
 * rather than the thickness of a slab: relief you read at the terminator, never
 * on the outline.
 */

const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 512;
const BUMP_SCALE = 0.045;
// How far from the body colour a pixel must sit before it counts as paint, and
// over what distance that judgement fades in. Both in RGB units.
const PAINT_MATCH_DISTANCE = 26;
const PAINT_EDGE_SOFTNESS = 34;
// Rim samples are read at grazing angles where an orthographic view has almost
// no information left. Pulling them in slightly trades a sliver of the outer
// drawing for an edge that is not a smear of one pixel column.
const RIM_INSET = 0.985;

function sphericalToDisc(u, v) {
  // Three.js SphereGeometry, verbatim: x = -cos(phi)sin(theta), y = cos(theta),
  // z = sin(phi)sin(theta) with phi = u*2pi and theta = v*pi. Deriving this from
  // a generic "longitude = (u-0.5)*2pi" instead puts the front of the planet at
  // u=0.5, but the geometry puts it at u=0.25, and the drawing lands a quarter
  // turn away - visible only as the composition sliding off to both edges.
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  const sinTheta = Math.sin(theta);
  return {
    // Camera on +z with +y up, so screen x is world x and screen y is world y:
    // an orthographic view of the front hemisphere is exactly (x, y).
    x: -Math.cos(phi) * sinTheta * RIM_INSET,
    y: Math.cos(theta) * RIM_INSET,
  };
}

function buildEquirectangularCanvas(image) {
  const source = document.createElement('canvas');
  const size = Math.min(image.width || 512, image.height || 512, 512);
  source.width = size;
  source.height = size;
  const sourceContext = source.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!sourceContext) return null;
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = 'high';
  sourceContext.drawImage(image, 0, 0, size, size);
  const disc = sourceContext.getImageData(0, 0, size, size).data;

  const target = document.createElement('canvas');
  target.width = TEXTURE_WIDTH;
  target.height = TEXTURE_HEIGHT;
  const targetContext = target.getContext('2d', { alpha: false });
  if (!targetContext) return null;
  const painted = targetContext.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    const v = (y + 0.5) / TEXTURE_HEIGHT;
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const u = (x + 0.5) / TEXTURE_WIDTH;
      const disc2d = sphericalToDisc(u, v);
      // Disc space is [-1,1]; the source bitmap is [0,size).
      const sx = Math.min(size - 1, Math.max(0, Math.round((disc2d.x * 0.5 + 0.5) * (size - 1))));
      const sy = Math.min(size - 1, Math.max(0, Math.round((0.5 - disc2d.y * 0.5) * (size - 1))));
      const from = (sy * size + sx) * 4;
      const to = (y * TEXTURE_WIDTH + x) * 4;
      painted.data[to] = disc[from];
      painted.data[to + 1] = disc[from + 1];
      painted.data[to + 2] = disc[from + 2];
      painted.data[to + 3] = 255;
    }
  }

  targetContext.putImageData(painted, 0, 0);
  return { canvas: target, pixels: painted };
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

function bodyColourOf(entity, built) {
  if (typeof entity?.bodyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(entity.bodyColor)) {
    return [
      Number.parseInt(entity.bodyColor.slice(1, 3), 16),
      Number.parseInt(entity.bodyColor.slice(3, 5), 16),
      Number.parseInt(entity.bodyColor.slice(5, 7), 16),
    ];
  }
  // Older planets stored before tablets sent body_color. The pole row comes from
  // the disc's extreme edge, which the tablet never lets a stroke reach.
  return [built.pixels.data[0], built.pixels.data[1], built.pixels.data[2]];
}

function applySoftToySurface(entity, texture, renderer) {
  const image = texture?.image;
  if (!image || typeof document === 'undefined') return false;

  const built = buildEquirectangularCanvas(image);
  if (!built) return false;
  const maps = buildPaintMaps(built.pixels, bodyColourOf(entity, built));

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
  material.userData.kidsGalaxyDesignProjectionMode = 'orthographic-disc-mirrored-hemispheres';
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
