import * as THREE from 'three';

/**
 * High-fidelity sculpted-toy surface treatment.
 *
 * The child's drawing is treated as art direction rather than a literal skin.
 * The dominant paint becomes the smooth body colour, while only a few strong
 * secondary gestures survive as broad molded ribbons/blobs. Each accent gets a
 * darker same-hue shoulder and a rounded brighter top, matching the visual
 * language of the supplied clay/plastic planet references.
 */

const BASE_CLAY_COLOR = 0xf2ede6;
const GRID_WIDTH = 96;
const GRID_HEIGHT = 48;
const MAX_ACCENT_COLORS = 2;
const MAX_TOTAL_COMPONENTS = 4;
const MIN_COMPONENT_CELLS = 6;
const MIN_ACCENT_COVERAGE = 0.14;
const MAX_ACCENT_COVERAGE = 0.34;

const TABLET_PALETTE = [
  { rgb: [0xe5, 0x39, 0x35], toy: 0xff665b },
  { rgb: [0xff, 0x98, 0x00], toy: 0xffa447 },
  { rgb: [0xff, 0xeb, 0x3b], toy: 0xffdf49 },
  { rgb: [0x4c, 0xaf, 0x50], toy: 0x63cf62 },
  { rgb: [0x21, 0x96, 0xf3], toy: 0x47aef4 },
  { rgb: [0x9c, 0x27, 0xb0], toy: 0xb46bd6 },
  { rgb: [0xe9, 0x1e, 0x63], toy: 0xf5689b },
  { rgb: [0x00, 0x00, 0x00], toy: 0x434751 },
];

export const POLISHED_SURFACE_PROFILE = Object.freeze({
  textureWidth: 512,
  textureHeight: 256,
  accentEdgeRadius: 1.078,
  accentRadius: 1.112,
  accentBumpScale: 0.055,
  accentDisplacementScale: 0.024,
  accentEdgeAlphaTest: 0.18,
  accentAlphaTest: 0.42,
  maxAnisotropy: 12,
  clearcoat: 0.085,
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
    .offsetHSL(0, 0.01, -0.005)
    .getHex();
}

function topColourFor(paletteIndex, selfAccent = false) {
  return new THREE.Color(TABLET_PALETTE[paletteIndex].toy).offsetHSL(
    0,
    0.015,
    selfAccent ? 0.105 : 0.045,
  );
}

function edgeColourFor(topColour) {
  return topColour.clone().offsetHSL(0, -0.012, -0.135);
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

function roundedReliefCanvas(maskSmall, width, height) {
  const hard = upscaleCanvas(maskSmall, width, height);
  const soft = softenedCanvas(hard, 7.5);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d', { alpha: false });
  if (!context) return soft;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  context.drawImage(soft, 0, 0);
  context.globalAlpha = 0.5;
  context.drawImage(hard, 0, 0);
  context.globalAlpha = 1;
  return output;
}

function textureFromCanvas(canvas, colorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
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

function dilateAxis(mask, radiusX = 1, radiusY = 1) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      let on = 0;
      for (let dy = -radiusY; dy <= radiusY && !on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_HEIGHT) continue;
        for (let dx = -radiusX; dx <= radiusX; dx += 1) {
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

function erodeAxis(mask, radiusX = 1, radiusY = 1) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      let on = 1;
      for (let dy = -radiusY; dy <= radiusY && on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_HEIGHT) {
          on = 0;
          break;
        }
        for (let dx = -radiusX; dx <= radiusX; dx += 1) {
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

function maskForComponent(component) {
  const mask = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  component.forEach((index) => {
    mask[index] = 1;
  });
  return mask;
}

function componentStats(component) {
  let minX = GRID_WIDTH;
  let maxX = 0;
  let minY = GRID_HEIGHT;
  let maxY = 0;
  component.forEach((index) => {
    const x = index % GRID_WIDTH;
    const y = Math.floor(index / GRID_WIDTH);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return {
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

function stylizeComponent(component) {
  const stats = componentStats(component);
  const aspect = stats.width / stats.height;
  let mask = maskForComponent(component);

  // Long gestures become broad ribbons; compact gestures become clean blobs.
  if (aspect >= 1.65) {
    mask = dilateAxis(mask, 4, 1);
    mask = erodeAxis(dilateAxis(mask, 1, 1), 1, 1);
  } else if (aspect <= 0.65) {
    mask = dilateAxis(mask, 2, 2);
    mask = erodeAxis(dilateAxis(mask, 1, 2), 1, 1);
  } else {
    mask = dilateAxis(mask, 2, 2);
    mask = erodeAxis(dilateAxis(mask, 1, 1), 1, 1);
  }
  return mask;
}

function countCoverage(labels) {
  let painted = 0;
  labels.forEach((value) => {
    if (value >= 0) painted += 1;
  });
  return painted / labels.length;
}

function simplifyAccents(
  sourcePixels,
  selectedColours,
  excludeDominant,
  dominantIndex,
) {
  const sourceWidth = POLISHED_SURFACE_PROFILE.textureWidth;
  const sourceHeight = POLISHED_SURFACE_PROFILE.textureHeight;
  const cellWidth = sourceWidth / GRID_WIDTH;
  const cellHeight = sourceHeight / GRID_HEIGHT;
  const selectedSet = new Set(selectedColours);
  const colourMasks = new Map(
    selectedColours.map((colour) => [colour, new Uint8Array(GRID_WIDTH * GRID_HEIGHT)]),
  );

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
          if (excludeDominant && paletteIndex === dominantIndex) continue;
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
      if (winnerVotes >= 3) colourMasks.get(winner)[gridIndex(gx, gy)] = 1;
    }
  }

  const candidates = [];
  selectedColours.forEach((colour) => {
    let mask = colourMasks.get(colour);
    // Close small holes and fuse nearby brush marks before finding shapes.
    mask = erodeAxis(dilateAxis(mask, 2, 1), 1, 1);
    mask = dilateAxis(mask, 1, 1);
    componentsFor(mask).forEach((component) => {
      candidates.push({
        colour,
        size: component.length,
        mask: stylizeComponent(component),
      });
    });
  });

  const retained = candidates
    .sort((left, right) => right.size - left.size)
    .slice(0, MAX_TOTAL_COMPONENTS);

  const rebuildLabels = () => {
    const labels = new Int16Array(GRID_WIDTH * GRID_HEIGHT);
    labels.fill(-1);
    retained.forEach(({ colour, mask }) => {
      mask.forEach((on, index) => {
        if (on && labels[index] < 0) labels[index] = colour;
      });
    });
    return labels;
  };

  let labels = rebuildLabels();
  let passes = 0;
  while (countCoverage(labels) > MAX_ACCENT_COVERAGE && passes < 5) {
    retained.forEach((candidate) => {
      candidate.mask = erodeAxis(candidate.mask, 1, 1);
    });
    labels = rebuildLabels();
    passes += 1;
  }

  if (
    retained.length > 0 &&
    countCoverage(labels) < MIN_ACCENT_COVERAGE
  ) {
    retained.forEach((candidate) => {
      candidate.mask = dilateAxis(candidate.mask, 1, 1);
    });
    const expanded = rebuildLabels();
    if (countCoverage(expanded) <= MAX_ACCENT_COVERAGE) labels = expanded;
  }

  return { labels, componentCount: retained.length };
}

function maskCanvasFromBinary(mask) {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_WIDTH;
  canvas.height = GRID_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return canvas;
  const image = context.createImageData(GRID_WIDTH, GRID_HEIGHT);
  mask.forEach((on, index) => {
    const pixel = index * 4;
    const value = on ? 255 : 0;
    image.data[pixel] = value;
    image.data[pixel + 1] = value;
    image.data[pixel + 2] = value;
    image.data[pixel + 3] = 255;
  });
  context.putImageData(image, 0, 0);
  return canvas;
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
    const hasMeaningfulPaint = paintedPixels > pixelCount * 0.02;
    const useDominantAsBody =
      hasMeaningfulPaint && (coverage >= 0.12 || meaningfulColours >= 2);
    const baseColor = useDominantAsBody ? bodyColourFor(dominantIndex) : BASE_CLAY_COLOR;

    let selectedColours = counts
      .map((count, index) => ({ count, index }))
      .filter(({ count, index }) => {
        if (count <= pixelCount * 0.004) return false;
        return !useDominantAsBody || index !== dominantIndex;
      })
      .sort((left, right) => right.count - left.count)
      .slice(0, MAX_ACCENT_COLORS)
      .map(({ index }) => index);

    // A sparse one-colour drawing still gets a lighter molded interpretation,
    // but a fully painted one-colour canvas correctly becomes a clean solid body.
    const selfAccent =
      selectedColours.length === 0 &&
      useDominantAsBody &&
      coverage >= 0.035 &&
      coverage < 0.42;
    if (selfAccent) selectedColours = [dominantIndex];

    const { labels, componentCount } = simplifyAccents(
      sourcePixels,
      selectedColours,
      useDominantAsBody && !selfAccent,
      dominantIndex,
    );
    const accentCoverage = countCoverage(labels);

    const maskBinary = new Uint8Array(labels.length);
    labels.forEach((paletteIndex, index) => {
      maskBinary[index] = paletteIndex >= 0 ? 1 : 0;
    });
    const edgeBinary = dilateAxis(maskBinary, 1, 1);

    const maskSmall = maskCanvasFromBinary(maskBinary);
    const edgeMaskSmall = maskCanvasFromBinary(edgeBinary);

    const colourSmall = document.createElement('canvas');
    colourSmall.width = GRID_WIDTH;
    colourSmall.height = GRID_HEIGHT;
    const colourContext = colourSmall.getContext('2d', { alpha: false });
    if (!colourContext) return null;
    const colourImage = colourContext.createImageData(GRID_WIDTH, GRID_HEIGHT);

    const edgeColourSmall = document.createElement('canvas');
    edgeColourSmall.width = GRID_WIDTH;
    edgeColourSmall.height = GRID_HEIGHT;
    const edgeColourContext = edgeColourSmall.getContext('2d', { alpha: false });
    if (!edgeColourContext) return null;
    const edgeColourImage = edgeColourContext.createImageData(GRID_WIDTH, GRID_HEIGHT);

    let componentCells = 0;
    for (let index = 0; index < labels.length; index += 1) {
      const pixel = index * 4;
      const paletteIndex = labels[index];
      if (paletteIndex < 0) {
        colourImage.data[pixel] = 255;
        colourImage.data[pixel + 1] = 255;
        colourImage.data[pixel + 2] = 255;
        colourImage.data[pixel + 3] = 255;
        edgeColourImage.data[pixel] = 255;
        edgeColourImage.data[pixel + 1] = 255;
        edgeColourImage.data[pixel + 2] = 255;
        edgeColourImage.data[pixel + 3] = 255;
        continue;
      }

      componentCells += 1;
      const top = topColourFor(paletteIndex, selfAccent && paletteIndex === dominantIndex);
      const edge = edgeColourFor(top);
      colourImage.data[pixel] = Math.round(top.r * 255);
      colourImage.data[pixel + 1] = Math.round(top.g * 255);
      colourImage.data[pixel + 2] = Math.round(top.b * 255);
      colourImage.data[pixel + 3] = 255;
      edgeColourImage.data[pixel] = Math.round(edge.r * 255);
      edgeColourImage.data[pixel + 1] = Math.round(edge.g * 255);
      edgeColourImage.data[pixel + 2] = Math.round(edge.b * 255);
      edgeColourImage.data[pixel + 3] = 255;
    }

    colourContext.putImageData(colourImage, 0, 0);
    edgeColourContext.putImageData(edgeColourImage, 0, 0);

    const topMaskLarge = softenedCanvas(upscaleCanvas(maskSmall, width, height), 2.6);
    const edgeMaskLarge = softenedCanvas(upscaleCanvas(edgeMaskSmall, width, height), 4.6);
    const reliefLarge = roundedReliefCanvas(maskSmall, width, height);
    const colourLarge = softenedCanvas(upscaleCanvas(colourSmall, width, height), 1.8);
    const edgeColourLarge = softenedCanvas(
      upscaleCanvas(edgeColourSmall, width, height),
      2.3,
    );

    const topMask = textureFromCanvas(topMaskLarge, THREE.NoColorSpace);
    return {
      mask: topMask,
      topMask,
      edgeMask: textureFromCanvas(edgeMaskLarge, THREE.NoColorSpace),
      relief: textureFromCanvas(reliefLarge, THREE.NoColorSpace),
      colour: textureFromCanvas(colourLarge, THREE.SRGBColorSpace),
      edgeColour: textureFromCanvas(edgeColourLarge, THREE.SRGBColorSpace),
      baseColor,
      coverage,
      accentCoverage,
      accentColorCount: selectedColours.length,
      componentCount,
      componentCells,
      useDominantAsBody,
      selfAccent,
    };
  } catch (_error) {
    return null;
  }
}

function disposeArtworkExcept(artwork, keep) {
  [
    artwork.topMask,
    artwork.edgeMask,
    artwork.relief,
    artwork.colour,
    artwork.edgeColour,
  ].forEach((texture) => {
    if (texture && texture !== keep) texture.dispose();
  });
}

export function createPaletteReliefMap(texture) {
  const artwork = prepareArtwork(texture);
  if (!artwork) return null;
  const keep = artwork.relief;
  disposeArtworkExcept(artwork, keep);
  return keep;
}

export function createPaintMask(texture) {
  const artwork = prepareArtwork(texture);
  if (!artwork) return null;
  const keep = artwork.topMask;
  disposeArtworkExcept(artwork, keep);
  return keep;
}

export function createPolishedPlanetMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: BASE_CLAY_COLOR,
    roughness: 0.48,
    metalness: 0.002,
    clearcoat: POLISHED_SURFACE_PROFILE.clearcoat,
    clearcoatRoughness: 0.6,
  });
}

export function createMoldedAccentEdgeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.47,
    metalness: 0.002,
    clearcoat: 0.075,
    clearcoatRoughness: 0.62,
    alphaTest: POLISHED_SURFACE_PROFILE.accentEdgeAlphaTest,
    transparent: false,
    depthWrite: true,
  });
}

export function createMoldedAccentMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.41,
    metalness: 0.002,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
    alphaTest: POLISHED_SURFACE_PROFILE.accentAlphaTest,
    transparent: false,
    depthWrite: true,
  });
}

export function createPolishedFeatureMaterial(
  color,
  {
    roughness = 0.5,
    clearcoat = 0.14,
    metalness = 0.006,
    side = THREE.FrontSide,
  } = {},
) {
  const resolvedColor = color?.isColor ? color.clone() : new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: resolvedColor,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness: Math.min(0.74, roughness + 0.1),
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

  configureTexture(artwork.topMask, renderer, THREE.NoColorSpace);
  configureTexture(artwork.edgeMask, renderer, THREE.NoColorSpace);
  configureTexture(artwork.relief, renderer, THREE.NoColorSpace);
  configureTexture(artwork.colour, renderer, THREE.SRGBColorSpace);
  configureTexture(artwork.edgeColour, renderer, THREE.SRGBColorSpace);

  baseMaterial.map = null;
  baseMaterial.bumpMap = null;
  baseMaterial.displacementMap = null;
  baseMaterial.color.setHex(artwork.baseColor);
  baseMaterial.emissive.setHex(0x000000);
  baseMaterial.emissiveIntensity = 0;
  baseMaterial.userData.kidsGalaxyReferenceSurface = true;
  baseMaterial.userData.accentCoverage = artwork.accentCoverage;
  baseMaterial.userData.accentColorCount = artwork.accentColorCount;
  baseMaterial.userData.componentCount = artwork.componentCount;
  baseMaterial.needsUpdate = true;

  edgeMaterial.map = artwork.edgeColour;
  edgeMaterial.alphaMap = artwork.edgeMask;
  edgeMaterial.bumpMap = artwork.relief;
  edgeMaterial.bumpScale = 0.032;
  edgeMaterial.color.setHex(0xffffff);
  edgeMaterial.userData.kidsGalaxySameHueShoulder = true;
  edgeMaterial.needsUpdate = true;

  accentMaterial.map = artwork.colour;
  accentMaterial.alphaMap = artwork.topMask;
  accentMaterial.bumpMap = artwork.relief;
  accentMaterial.bumpScale = POLISHED_SURFACE_PROFILE.accentBumpScale;
  accentMaterial.displacementMap = artwork.relief;
  accentMaterial.displacementScale = POLISHED_SURFACE_PROFILE.accentDisplacementScale;
  accentMaterial.displacementBias = -0.002;
  accentMaterial.color.setHex(0xffffff);
  accentMaterial.emissive.setHex(0x000000);
  accentMaterial.emissiveIntensity = 0;
  accentMaterial.userData.kidsGalaxyRoundedMoldedTop = true;
  accentMaterial.needsUpdate = true;

  sourceTexture.dispose();
  return artwork;
}

// Compatibility helpers kept for manual projector tools that still use the old
// two-call contract. PlanetEntity uses applySculptedArtwork directly.
export function applyPolishedTexture(material, texture, _renderer) {
  const artwork = prepareArtwork(texture);
  if (!artwork) return null;
  material.map = null;
  material.bumpMap = null;
  material.displacementMap = null;
  material.color.setHex(artwork.baseColor);
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.userData.kidsGalaxyReferenceSurface = true;
  material.needsUpdate = true;
  disposeArtworkExcept(artwork, null);
  return { sculptedBase: true, baseColor: artwork.baseColor };
}

export function applyMoldedAccentTexture(material, texture, renderer) {
  const artwork = prepareArtwork(texture);
  if (!artwork) return null;
  configureTexture(artwork.topMask, renderer, THREE.NoColorSpace);
  configureTexture(artwork.relief, renderer, THREE.NoColorSpace);
  configureTexture(artwork.colour, renderer, THREE.SRGBColorSpace);
  material.map = artwork.colour;
  material.alphaMap = artwork.topMask;
  material.bumpMap = artwork.relief;
  material.bumpScale = POLISHED_SURFACE_PROFILE.accentBumpScale;
  material.displacementMap = artwork.relief;
  material.displacementScale = POLISHED_SURFACE_PROFILE.accentDisplacementScale;
  material.displacementBias = -0.002;
  material.color.setHex(0xffffff);
  material.userData.kidsGalaxyRoundedMoldedTop = true;
  material.needsUpdate = true;
  artwork.edgeMask.dispose();
  artwork.edgeColour.dispose();
  return artwork.topMask;
}
