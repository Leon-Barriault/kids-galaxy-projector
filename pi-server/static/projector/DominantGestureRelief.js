import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const DISC_SIZE = 256;
const GRID = 128;
const MAP_WIDTH = 512;
const MAP_HEIGHT = 256;
const MIN_GESTURE_COVERAGE = 0.035;
const MAX_GESTURE_COVERAGE = 0.48;
const FRONT_HALF_LONGITUDE = 0.22;
const FRONT_HALF_LATITUDE = 0.36;
const BACK_HALF_LONGITUDE = 0.16;
const BACK_HALF_LATITUDE = 0.29;

const PALETTE = [
  [0xe5, 0x39, 0x35],
  [0xff, 0x98, 0x00],
  [0xff, 0xeb, 0x3b],
  [0x4c, 0xaf, 0x50],
  [0x21, 0x96, 0xf3],
  [0x9c, 0x27, 0xb0],
  [0xe9, 0x1e, 0x63],
  [0x00, 0x00, 0x00],
];

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

function sizeOf(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 0,
  };
}

function whiteDistance(r, g, b) {
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
}

function nearestPalette(r, g, b) {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  PALETTE.forEach((rgb, index) => {
    const dr = r - rgb[0];
    const dg = g - rgb[1];
    const db = b - rgb[2];
    const candidate = dr * dr + dg * dg + db * db;
    if (candidate >= distance) return;
    distance = candidate;
    best = index;
  });
  return best;
}

function recoverLegacy(source) {
  const sourceContext = source.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  });
  if (!sourceContext) return null;
  const sourcePixels = sourceContext.getImageData(
    0,
    0,
    source.width,
    source.height,
  ).data;
  const output = canvas(DISC_SIZE, DISC_SIZE);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return null;
  const pixels = context.createImageData(DISC_SIZE, DISC_SIZE);
  const centre = (DISC_SIZE - 1) / 2;
  const radius = DISC_SIZE * 0.485;

  for (let y = 0; y < DISC_SIZE; y += 1) {
    for (let x = 0; x < DISC_SIZE; x += 1) {
      const nx = (x - centre) / radius;
      const ny = (y - centre) / radius;
      const radial = Math.hypot(nx, ny);
      const destination = (y * DISC_SIZE + x) * 4;
      if (radial > 1) {
        pixels.data[destination] = 255;
        pixels.data[destination + 1] = 255;
        pixels.data[destination + 2] = 255;
        pixels.data[destination + 3] = 255;
        continue;
      }
      let angle = Math.atan2(ny, nx) / (Math.PI * 2);
      if (angle < 0) angle += 1;
      const sx = Math.min(source.width - 1, Math.floor(angle * source.width));
      const sy = Math.min(source.height - 1, Math.floor(radial * source.height));
      const sourceIndex = (sy * source.width + sx) * 4;
      pixels.data[destination] = sourcePixels[sourceIndex];
      pixels.data[destination + 1] = sourcePixels[sourceIndex + 1];
      pixels.data[destination + 2] = sourcePixels[sourceIndex + 2];
      pixels.data[destination + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return output;
}

function recoverDisc(image) {
  const dimensions = sizeOf(image);
  if (!dimensions.width || !dimensions.height) return null;
  const legacy = dimensions.width >= dimensions.height * 1.45;
  const source = canvas(legacy ? 512 : DISC_SIZE, legacy ? 256 : DISC_SIZE);
  const context = source.getContext('2d', { alpha: false });
  if (!context) return null;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, source.width, source.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(image, 0, 0, source.width, source.height);
  if (legacy) return recoverLegacy(source);

  const output = canvas(DISC_SIZE, DISC_SIZE);
  const outputContext = output.getContext('2d', { alpha: false });
  if (!outputContext) return null;
  outputContext.fillStyle = '#fff';
  outputContext.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  outputContext.imageSmoothingEnabled = true;
  outputContext.drawImage(source, 0, 0, DISC_SIZE, DISC_SIZE);
  return output;
}

function gridIndex(x, y) {
  return y * GRID + x;
}

function closeMask(mask) {
  const dilated = new Uint8Array(mask.length);
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= GRID) continue;
          if (mask[gridIndex(nx, ny)]) {
            on = 1;
            break;
          }
        }
      }
      dilated[gridIndex(x, y)] = on;
    }
  }

  const output = new Uint8Array(mask.length);
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      let on = 1;
      for (let dy = -1; dy <= 1 && on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID) {
          on = 0;
          break;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= GRID || !dilated[gridIndex(nx, ny)]) {
            on = 0;
            break;
          }
        }
      }
      output[gridIndex(x, y)] = on;
    }
  }
  return output;
}

function analyseDominantGesture(disc) {
  const sample = canvas(GRID, GRID);
  const context = sample.getContext('2d', {
    alpha: false,
    willReadFrequently: true,
  });
  if (!context) return null;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, GRID, GRID);
  context.imageSmoothingEnabled = true;
  context.drawImage(disc, 0, 0, GRID, GRID);
  const pixels = context.getImageData(0, 0, GRID, GRID).data;
  const labels = new Int16Array(GRID * GRID);
  labels.fill(-1);
  const counts = new Array(PALETTE.length).fill(0);
  let inside = 0;

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const nx = ((x + 0.5) / GRID - 0.5) * 2;
      const ny = ((y + 0.5) / GRID - 0.5) * 2;
      if (nx * nx + ny * ny > 0.965 * 0.965) continue;
      inside += 1;
      const pixel = gridIndex(x, y) * 4;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      if (whiteDistance(r, g, b) < 0.08) continue;
      const palette = nearestPalette(r, g, b);
      labels[gridIndex(x, y)] = palette;
      counts[palette] += 1;
    }
  }

  let dominant = 0;
  counts.forEach((count, index) => {
    if (count > counts[dominant]) dominant = index;
  });
  const coverage = counts[dominant] / Math.max(1, inside);
  if (
    coverage < MIN_GESTURE_COVERAGE ||
    coverage > MAX_GESTURE_COVERAGE
  ) {
    return null;
  }

  const mask = new Uint8Array(labels.length);
  labels.forEach((label, index) => {
    if (label === dominant) mask[index] = 1;
  });
  return { dominant, coverage, mask: closeMask(mask) };
}

function sampleMask(mask, x, y) {
  if (x * x + y * y > 1) return false;
  const gx = Math.round((0.5 + x * 0.49) * (GRID - 1));
  const gy = Math.round((0.5 - y * 0.49) * (GRID - 1));
  if (gx < 0 || gx >= GRID || gy < 0 || gy >= GRID) return false;
  return Boolean(mask[gridIndex(gx, gy)]);
}

function wrapSigned(value) {
  let result = value;
  while (result > 0.5) result -= 1;
  while (result < -0.5) result += 1;
  return result;
}

function buildSphereMask(entity, analysis) {
  const output = canvas(MAP_WIDTH, MAP_HEIGHT);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return null;
  const image = context.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const seed = entity.animator.hashId(`${entity.id}-dominant-gesture-back`);
  const backAngle = 0.18 + entity.seededUnit(seed, 5) * 0.26;
  const cosine = Math.cos(backAngle);
  const sine = Math.sin(backAngle);

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    const v = (y + 0.5) / MAP_HEIGHT;
    const latitude = 0.5 - v;
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const u = (x + 0.5) / MAP_WIDTH;
      const frontU = wrapSigned(u - 0.5);
      let on = false;

      if (
        Math.abs(frontU) <= FRONT_HALF_LONGITUDE &&
        Math.abs(latitude) <= FRONT_HALF_LATITUDE
      ) {
        on = sampleMask(
          analysis.mask,
          frontU / FRONT_HALF_LONGITUDE,
          latitude / FRONT_HALF_LATITUDE,
        );
      } else {
        const backU = wrapSigned(u);
        if (
          Math.abs(backU) <= BACK_HALF_LONGITUDE &&
          Math.abs(latitude) <= BACK_HALF_LATITUDE
        ) {
          const rawX = -backU / BACK_HALF_LONGITUDE;
          const rawY = latitude / BACK_HALF_LATITUDE;
          const rotatedX = rawX * cosine - rawY * sine;
          const rotatedY = rawX * sine + rawY * cosine;
          on = sampleMask(analysis.mask, rotatedX * 0.9, rotatedY * 0.9);
        }
      }

      const pixel = (y * MAP_WIDTH + x) * 4;
      const value = on ? 255 : 0;
      image.data[pixel] = value;
      image.data[pixel + 1] = value;
      image.data[pixel + 2] = value;
      image.data[pixel + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return output;
}

function blurred(source, pixels) {
  const output = canvas(source.width, source.height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;
  context.fillStyle = '#000';
  context.fillRect(0, 0, output.width, output.height);
  if ('filter' in context) context.filter = `blur(${pixels}px)`;
  context.drawImage(source, 0, 0);
  if ('filter' in context) context.filter = 'none';
  return output;
}

function makeTexture(source, renderer) {
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(
    12,
    renderer.capabilities.getMaxAnisotropy(),
  );
  // SphereGeometry presents +Z at u=0.25 while the authored front motif sits
  // at u=0.5, matching the rest of the kid-artwork projection pipeline.
  texture.offset.x = 0.25;
  texture.needsUpdate = true;
  return texture;
}

function applyDominantGesture(entity, image) {
  const disc = recoverDisc(image);
  if (!disc) return false;
  const analysis = analyseDominantGesture(disc);
  if (!analysis) return false;
  const maskCanvas = buildSphereMask(entity, analysis);
  if (!maskCanvas) return false;

  const material = entity.mesh.material;
  const bodyColour = material.color.clone();

  // Dominant paint already defines the body. Preserve any deliberate strokes
  // in that same colour only as shallow physical relief; do not repaint the
  // whole sphere through a texture or turn the material white. This keeps the
  // clean reference-style body while retaining the child's gesture under light.
  material.map?.dispose();
  material.bumpMap?.dispose();
  material.displacementMap?.dispose();
  material.map = null;
  material.bumpMap = makeTexture(blurred(maskCanvas, 2.4), entity.scene.renderer);
  material.bumpScale = 0.008;
  material.displacementMap = makeTexture(
    blurred(maskCanvas, 4.4),
    entity.scene.renderer,
  );
  material.displacementScale = 0.0024;
  material.displacementBias = -0.00015;
  material.color.copy(bodyColour);
  material.userData.kidsGalaxyDominantGestureRelief = true;
  material.userData.kidsGalaxyDominantGestureCoverage = analysis.coverage;
  material.userData.kidsGalaxyDominantGesturePalette = analysis.dominant;
  material.userData.kidsGalaxyDominantGestureStyle =
    'subtle-localized-same-hue-emboss';
  material.userData.kidsGalaxyDominantGestureBumpScale = material.bumpScale;
  material.needsUpdate = true;
  return true;
}

/**
 * Preserve partial dominant-colour brush gestures after that colour becomes the
 * planet body. Broad/fill-like dominant paint stays a clean body; deliberate
 * partial strokes become a subtle localized emboss instead of disappearing.
 */
export function installDominantGestureRelief() {
  if (
    PlanetEntity.prototype.applyTexture?.kidsGalaxyDominantGestureRelief
  ) {
    return;
  }
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function dominantGestureTexture(texture) {
    const source = texture?.image;
    let copy = null;
    if (source && typeof document !== 'undefined') {
      const dimensions = sizeOf(source);
      if (dimensions.width && dimensions.height) {
        copy = canvas(dimensions.width, dimensions.height);
        const context = copy.getContext('2d', { alpha: false });
        if (context) {
          context.fillStyle = '#fff';
          context.fillRect(0, 0, copy.width, copy.height);
          context.drawImage(source, 0, 0, copy.width, copy.height);
        } else {
          copy = null;
        }
      }
    }

    previousApplyTexture.call(this, texture);
    if (
      !copy ||
      !this.mesh.material.userData?.kidsGalaxyComponentSurface
    ) {
      return;
    }
    applyDominantGesture(this, copy);
  }

  dominantGestureTexture.kidsGalaxyDominantGestureRelief = true;
  PlanetEntity.prototype.applyTexture = dominantGestureTexture;
}
