import * as THREE from 'three';

/**
 * Pi-friendly sculpted-toy surface treatment.
 *
 * The child's drawing is interpreted rather than wrapped literally around the
 * globe. A dominant painted colour can become the smooth planet body while the
 * strongest secondary regions are merged, simplified and turned into a small
 * number of raised molded accents. That keeps the child's palette and gesture
 * language while producing the broad ribbons/blobs of the visual reference.
 */

const BASE_CLAY_COLOR = 0xf2ede6;
const GRID_WIDTH = 64;
const GRID_HEIGHT = 32;
const MAX_ACCENT_COLORS = 3;
const MAX_COMPONENTS_PER_COLOR = 2;
const MIN_COMPONENT_CELLS = 3;
const MAX_ACCENT_COVERAGE = 0.38;

const TABLET_PALETTE = [
  { rgb: [0xe5, 0x39, 0x35], toy: 0xff6259 },
  { rgb: [0xff, 0x98, 0x00], toy: 0xffa63f },
  { rgb: [0xff, 0xeb, 0x3b], toy: 0xffe566 },
  { rgb: [0x4c, 0xaf, 0x50], toy: 0x62ca78 },
  { rgb: [0x21, 0x96, 0xf3], toy: 0x55aaff },
  { rgb: [0x9c, 0x27, 0xb0], toy: 0xb25ed1 },
  { rgb: [0xe9, 0x1e, 0x63], toy: 0xf55f99 },
  { rgb: [0x00, 0x00, 0x00], toy: 0x41434d },
];

export const POLISHED_SURFACE_PROFILE = Object.freeze({
  textureWidth: 256,
  textureHeight: 128,
  accentEdgeRadius: 1.07,
  accentRadius: 1.095,
  accentBumpScale: 0.082,
  accentDisplacementScale: 0.05,
  accentEdgeAlphaTest: 0.08,
  accentAlphaTest: 0.34,
  maxAnisotropy: 4,
  clearcoat: 0.035,
});

function paintPresence(r, g, b) {
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
  return THREE.MathUtils.smoothstep(distance, 0.035, 0.2);
}

function nearestPaletteIndex(r, g, b) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  TABLET_PALETTE.forEach((swatch, index) => {
    const dr = r - swatch.rgb[0];
    const dg = g - swatch.rgb[1];
    const db = b - swatch.rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function bodyColourFor(paletteIndex) {
  return new THREE.Color(TABLET_PALETTE[paletteIndex].toy)
    .offsetHSL(0, -0.055, 0.035)
    .getHex();
}

function softenedCanvas(source, blur) {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;

  context.imageSmoothingEnabled = true;
  if ('filter' in context) {
    context.filter = `blur(${blur}px)`;
    context.drawImage(source, 0, 0);
    context.filter = 'none';
    return output;
  }

  const half = document.createElement('canvas');
  half.width = Math.max(1, source.width >> 1);
  half.height = Math.max(1, source.height >> 1);
  const halfContext = half.getContext('2d', { alpha: false });
  if (!halfContext) return source;
  halfContext.imageSmoothingEnabled = true;
  halfContext.drawImage(source, 0, 0, half.width, half.height);
  context.drawImage(half, 0, 0, output.width, output.height);
  return output;
}

function upscaleCanvas(source, width, height) {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;
  context.imageSmoothingEnabled = true;
  context.drawImage(source, 0, 0, width, height);
  return output;
}

function textureFromCanvas(canvas, colorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function configureTexture(texture, renderer, colorSpace) {
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(
    POLISHED_SURFACE_PROFILE.maxAnisotropy,
    renderer.capabilities.getMaxAnisotropy(),
  );
  texture.needsUpdate = true;
}

function gridIndex(x, y) {
  return y * GRID_WIDTH + x;
}

function wrappedX(x) {
  return (x + GRID_WIDTH) % GRID_WIDTH;
}

function dilate(mask) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_HEIGHT) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (mask[gridIndex(wrappedX(x + dx), ny)]) {
            on = 1;
            break;
          }
        }
      }
      output[gridIndex(x, y)] = on;
    }
  }
  return output;
}

function erode(mask) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      let on = 1;
      for (let dy = -1; dy <= 1 && on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_HEIGHT) {
          on = 0;
          break;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!mask[gridIndex(wrappedX(x + dx), ny)]) {
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

function componentsFor(mask) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const neighbours = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const start = gridIndex(x, y);
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      const component = [];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        component.push(current);
        const cy = Math.floor(current / GRID_WIDTH);
        const cx = current % GRID_WIDTH;
        neighbours.forEach(([dx, dy]) => {
          const ny = cy + dy;
          if (ny < 0 || ny >= GRID_HEIGHT) return;
          const next = gridIndex(wrappedX(cx + dx), ny);
          if (!mask[next] || visited[next]) return;
          visited[next] = 1;
          queue.push(next);
        });
      }
      if (component.length >= MIN_COMPONENT_CELLS) components.push(component);
    }
  }

  return components.sort((left, right) => right.length - left.length);
}

function countCoverage(labels) {
  let painted = 0;
  labels.forEach((value) => {
    if (value >= 0) painted += 1;
  });
  return painted / labels.length;
}

function simplifyAccents(sourcePixels, selectedColours, useDominantAsBody, dominantIndex) {
  const sourceWidth = POLISHED_SURFACE_PROFILE.textureWidth;
  const sourceHeight = POLISHED_SURFACE_PROFILE.textureHeight;
  const cellWidth = sourceWidth / GRID_WIDTH;
  const cellHeight = sourceHeight / GRID_HEIGHT;
  const selectedSet = new Set(selectedColours);
  const colourMasks = new Map(selectedColours.map((colour) => [colour, new Uint8Array(GRID_WIDTH * GRID_HEIGHT)]));

  for (let gy = 0; gy < GRID_HEIGHT; gy += 1) {
    for (let gx = 0; gx < GRID_WIDTH; gx += 1) {
      const votes = new Map();
      const startX = Math.floor(gx * cellWidth);
      const endX = Math.floor((gx + 1) * cellWidth);
      const startY = Math.floor(gy * cellHeight);
      const endY = Math.floor((gy + 1) * cellHeight);
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = (y * sourceWidth + x) * 4;
          const r = sourcePixels[index];
          const g = sourcePixels[index + 1];
          const b = sourcePixels[index + 2];
          if (paintPresence(r, g, b) < 0.38) continue;
          const paletteIndex = nearestPaletteIndex(r, g, b);
          if (useDominantAsBody && paletteIndex === dominantIndex) continue;
          if (!selectedSet.has(paletteIndex)) continue;
          votes.set(paletteIndex, (votes.get(paletteIndex) || 0) + 1);
        }
      }
      if (!votes.size) continue;
      let winner = selectedColours[0];
      let winnerVotes = 0;
      votes.forEach((voteCount, paletteIndex) => {
        if (voteCount > winnerVotes) {
          winner = paletteIndex;
          winnerVotes = voteCount;
        }
      });
      if (winnerVotes >= 2) colourMasks.get(winner)[gridIndex(gx, gy)] = 1;
    }
  }

  const retained = new Map();
  selectedColours.forEach((colour) => {
    let mask = colourMasks.get(colour);
    mask = erode(dilate(mask));
    mask = dilate(mask);
    const keep = new Uint8Array(mask.length);
    componentsFor(mask)
      .slice(0, MAX_COMPONENTS_PER_COLOR)
      .forEach((component) => component.forEach((index) => { keep[index] = 1; }));
    retained.set(colour, keep);
  });

  const rebuildLabels = () => {
    const labels = new Int16Array(GRID_WIDTH * GRID_HEIGHT);
    labels.fill(-1);
    selectedColours.forEach((colour) => {
      retained.get(colour).forEach((on, index) => {
        if (on && labels[index] < 0) labels[index] = colour;
      });
    });
    return labels;
  };

  let labels = rebuildLabels();
  let erosionPasses = 0;
  while (countCoverage(labels) > MAX_ACCENT_COVERAGE && erosionPasses < 4) {
    selectedColours.forEach((colour) => retained.set(colour, erode(retained.get(colour))));
    labels = rebuildLabels();
    erosionPasses += 1;
  }

  return labels;
}

function prepareArtwork(texture) {
  if (typeof document === 'undefined' || !texture?.image) return null;

  try {
    const width = POLISHED_SURFACE_PROFILE.textureWidth;
    const height = POLISHED_SURFACE_PROFILE.textureHeight;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!sourceContext) return null;
    sourceContext.imageSmoothingEnabled = true;
    sourceContext.drawImage(texture.image, 0, 0, width, height);

    const sourceImage = sourceContext.getImageData(0, 0, width, height);
    const sourcePixels = sourceImage.data;
    const counts = new Array(TABLET_PALETTE.length).fill(0);
    let paintedPixels = 0;

    for (let index = 0; index < sourcePixels.length; index += 4) {
      const presence = paintPresence(
        sourcePixels[index],
        sourcePixels[index + 1],
        sourcePixels[index + 2],
      );
      if (presence < 0.42) continue;
      const paletteIndex = nearestPaletteIndex(
        sourcePixels[index],
        sourcePixels[index + 1],
        sourcePixels[index + 2],
      );
      counts[paletteIndex] += 1;
      paintedPixels += 1;
    }

    const pixelCount = width * height;
    const coverage = paintedPixels / pixelCount;
    let dominantIndex = 0;
    counts.forEach((count, index) => {
      if (count > counts[dominantIndex]) dominantIndex = index;
    });
    const meaningfulColours = counts.filter((count) => count > pixelCount * 0.004).length;
    const useDominantAsBody =
      coverage >= 0.5 || (coverage >= 0.3 && meaningfulColours >= 2);
    const baseColor = useDominantAsBody ? bodyColourFor(dominantIndex) : BASE_CLAY_COLOR;

    const selectedColours = counts
      .map((count, index) => ({ count, index }))
      .filter(({ count, index }) => {
        if (count <= pixelCount * 0.004) return false;
        return !useDominantAsBody || index !== dominantIndex;
      })
      .sort((left, right) => right.count - left.count)
      .slice(0, MAX_ACCENT_COLORS)
      .map(({ index }) => index);

    const labels = simplifyAccents(
      sourcePixels,
      selectedColours,
      useDominantAsBody,
      dominantIndex,
    );
    const accentCoverage = countCoverage(labels);

    const maskSmall = document.createElement('canvas');
    maskSmall.width = GRID_WIDTH;
    maskSmall.height = GRID_HEIGHT;
    const maskContext = maskSmall.getContext('2d', { alpha: false });
    if (!maskContext) return null;
    const maskImage = maskContext.createImageData(GRID_WIDTH, GRID_HEIGHT);

    const colourSmall = document.createElement('canvas');
    colourSmall.width = GRID_WIDTH;
    colourSmall.height = GRID_HEIGHT;
    const colourContext = colourSmall.getContext('2d', { alpha: false });
    if (!colourContext) return null;
    const colourImage = colourContext.createImageData(GRID_WIDTH, GRID_HEIGHT);

    let componentCells = 0;
    for (let index = 0; index < labels.length; index += 1) {
      const pixelIndex = index * 4;
      const paletteIndex = labels[index];
      if (paletteIndex < 0) {
        maskImage.data[pixelIndex] = 0;
        maskImage.data[pixelIndex + 1] = 0;
        maskImage.data[pixelIndex + 2] = 0;
        maskImage.data[pixelIndex + 3] = 255;
        colourImage.data[pixelIndex] = 255;
        colourImage.data[pixelIndex + 1] = 255;
        colourImage.data[pixelIndex + 2] = 255;
        colourImage.data[pixelIndex + 3] = 255;
        continue;
      }

      componentCells += 1;
      maskImage.data[pixelIndex] = 255;
      maskImage.data[pixelIndex + 1] = 255;
      maskImage.data[pixelIndex + 2] = 255;
      maskImage.data[pixelIndex + 3] = 255;
      const toy = new THREE.Color(TABLET_PALETTE[paletteIndex].toy).offsetHSL(0, 0.015, 0.025);
      colourImage.data[pixelIndex] = Math.round(toy.r * 255);
      colourImage.data[pixelIndex + 1] = Math.round(toy.g * 255);
      colourImage.data[pixelIndex + 2] = Math.round(toy.b * 255);
      colourImage.data[pixelIndex + 3] = 255;
    }

    maskContext.putImageData(maskImage, 0, 0);
    colourContext.putImageData(colourImage, 0, 0);
    const maskLarge = softenedCanvas(upscaleCanvas(maskSmall, width, height), 3.2);
    const colourLarge = softenedCanvas(upscaleCanvas(colourSmall, width, height), 1.25);

    return {
      mask: textureFromCanvas(maskLarge, THREE.NoColorSpace),
      colour: textureFromCanvas(colourLarge, THREE.SRGBColorSpace),
      baseColor,
      coverage,
      accentCoverage,
      accentColorCount: selectedColours.length,
      componentCells,
      useDominantAsBody,
    };
  } catch (_error) {
    return null;
  }
}

export function createPaletteReliefMap(texture) {
  const artwork = prepareArtwork(texture);
  if (!artwork) return null;
  artwork.colour.dispose();
  return artwork.mask;
}

export function createPaintMask(texture) {
  return createPaletteReliefMap(texture);
}

export function createPolishedPlanetMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: BASE_CLAY_COLOR,
    roughness: 0.62,
    metalness: 0.002,
    clearcoat: POLISHED_SURFACE_PROFILE.clearcoat,
    clearcoatRoughness: 0.72,
  });
}

export function createMoldedAccentEdgeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xb7aaa1,
    roughness: 0.66,
    metalness: 0.002,
    clearcoat: 0.02,
    clearcoatRoughness: 0.76,
    alphaTest: POLISHED_SURFACE_PROFILE.accentEdgeAlphaTest,
    transparent: false,
    depthWrite: true,
  });
}

export function createMoldedAccentMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.002,
    clearcoat: 0.065,
    clearcoatRoughness: 0.58,
    alphaTest: POLISHED_SURFACE_PROFILE.accentAlphaTest,
    transparent: false,
    depthWrite: true,
  });
}

export function createPolishedFeatureMaterial(
  color,
  {
    roughness = 0.56,
    clearcoat = 0.12,
    metalness = 0.008,
    side = THREE.FrontSide,
  } = {},
) {
  const resolvedColor = color?.isColor ? color.clone() : new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: resolvedColor,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness: Math.min(0.76, roughness + 0.1),
    side,
  });
}

export function applySculptedArtwork(
  baseMaterial,
  edgeMaterial,
  accentMaterial,
  sourceTexture,
  renderer,
) {
  const artwork = prepareArtwork(sourceTexture);
  if (!artwork) return null;
  configureTexture(artwork.mask, renderer, THREE.NoColorSpace);
  configureTexture(artwork.colour, renderer, THREE.SRGBColorSpace);

  baseMaterial.map = null;
  baseMaterial.bumpMap = null;
  baseMaterial.displacementMap = null;
  baseMaterial.color.setHex(artwork.baseColor);
  baseMaterial.emissive.setHex(0x000000);
  baseMaterial.emissiveIntensity = 0;
  baseMaterial.needsUpdate = true;

  edgeMaterial.map = artwork.colour;
  edgeMaterial.alphaMap = artwork.mask;
  edgeMaterial.bumpMap = artwork.mask;
  edgeMaterial.bumpScale = 0.025;
  edgeMaterial.color.setHex(0xb8aaa1);
  edgeMaterial.needsUpdate = true;

  accentMaterial.map = artwork.colour;
  accentMaterial.alphaMap = artwork.mask;
  accentMaterial.bumpMap = artwork.mask;
  accentMaterial.bumpScale = POLISHED_SURFACE_PROFILE.accentBumpScale;
  accentMaterial.displacementMap = artwork.mask;
  accentMaterial.displacementScale = POLISHED_SURFACE_PROFILE.accentDisplacementScale;
  accentMaterial.displacementBias = 0;
  accentMaterial.color.setHex(0xffffff);
  accentMaterial.emissive.setHex(0x000000);
  accentMaterial.emissiveIntensity = 0;
  accentMaterial.needsUpdate = true;

  sourceTexture.dispose();
  return artwork;
}

// Compatibility helpers kept for manual projector tools that still use the old
// two-call contract. PlanetEntity uses applySculptedArtwork directly.
export function applyPolishedTexture(material, texture, renderer) {
  const artwork = prepareArtwork(texture);
  if (!artwork) return null;
  material.map = null;
  material.bumpMap = null;
  material.displacementMap = null;
  material.color.setHex(artwork.baseColor);
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
  artwork.mask.dispose();
  artwork.colour.dispose();
  return { sculptedBase: true, baseColor: artwork.baseColor };
}

export function applyMoldedAccentTexture(material, texture, renderer) {
  const artwork = prepareArtwork(texture);
  if (!artwork) return null;
  configureTexture(artwork.mask, renderer, THREE.NoColorSpace);
  configureTexture(artwork.colour, renderer, THREE.SRGBColorSpace);
  material.map = artwork.colour;
  material.alphaMap = artwork.mask;
  material.bumpMap = artwork.mask;
  material.bumpScale = POLISHED_SURFACE_PROFILE.accentBumpScale;
  material.displacementMap = artwork.mask;
  material.displacementScale = POLISHED_SURFACE_PROFILE.accentDisplacementScale;
  material.displacementBias = 0;
  material.color.setHex(0xffffff);
  material.needsUpdate = true;
  return artwork.mask;
}
