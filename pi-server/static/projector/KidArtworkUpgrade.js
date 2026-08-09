import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BASE_CLAY_COLOR = 0xf2ede6;
const DISC_SIZE = 256;
const DISC_GRID = 112;
const MAP_GRID_WIDTH = 256;
const MAP_GRID_HEIGHT = 128;
const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;
const MAX_ACCENT_COLORS = 3;
const MIN_COMPONENT_CELLS = 5;
const MIN_ACCENT_COVERAGE = 0.075;
const MAX_ACCENT_COVERAGE = 0.42;

const TABLET_PALETTE = [
  [0xe5, 0x39, 0x35],
  [0xff, 0x98, 0x00],
  [0xff, 0xeb, 0x3b],
  [0x4c, 0xaf, 0x50],
  [0x21, 0x96, 0xf3],
  [0x9c, 0x27, 0xb0],
  [0xe9, 0x1e, 0x63],
  [0x00, 0x00, 0x00],
];

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function paintPresence(r, g, b) {
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
  return THREE.MathUtils.smoothstep(distance, 0.035, 0.18);
}

function nearestPaletteIndex(r, g, b) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  TABLET_PALETTE.forEach((rgb, index) => {
    const dr = r - rgb[0];
    const dg = g - rgb[1];
    const db = b - rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function imageDimensions(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 0,
  };
}

function recoverLegacyPolarDisc(source) {
  const output = createCanvas(DISC_SIZE, DISC_SIZE);
  const outputContext = output.getContext('2d', { alpha: false, willReadFrequently: true });
  const sourceContext = source.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!outputContext || !sourceContext) return null;

  const sourceImage = sourceContext.getImageData(0, 0, source.width, source.height);
  const image = outputContext.createImageData(DISC_SIZE, DISC_SIZE);
  const centre = (DISC_SIZE - 1) / 2;
  const radius = DISC_SIZE * 0.485;

  for (let y = 0; y < DISC_SIZE; y += 1) {
    for (let x = 0; x < DISC_SIZE; x += 1) {
      const nx = (x - centre) / radius;
      const ny = (y - centre) / radius;
      const radial = Math.hypot(nx, ny);
      const target = (y * DISC_SIZE + x) * 4;
      if (radial > 1) {
        image.data[target] = 255;
        image.data[target + 1] = 255;
        image.data[target + 2] = 255;
        image.data[target + 3] = 255;
        continue;
      }

      let longitude = Math.atan2(ny, nx) / (Math.PI * 2);
      if (longitude < 0) longitude += 1;
      const sourceX = Math.min(source.width - 1, Math.floor(longitude * source.width));
      const sourceY = Math.min(source.height - 1, Math.floor(radial * source.height));
      const sourcePixel = (sourceY * source.width + sourceX) * 4;
      image.data[target] = sourceImage.data[sourcePixel];
      image.data[target + 1] = sourceImage.data[sourcePixel + 1];
      image.data[target + 2] = sourceImage.data[sourcePixel + 2];
      image.data[target + 3] = 255;
    }
  }

  outputContext.putImageData(image, 0, 0);
  return output;
}

function recoverKidDisc(texture) {
  if (typeof document === 'undefined' || !texture?.image) return null;
  const dimensions = imageDimensions(texture.image);
  if (dimensions.width <= 0 || dimensions.height <= 0) return null;

  const sourceWidth = dimensions.width >= dimensions.height * 1.45 ? 512 : DISC_SIZE;
  const sourceHeight = dimensions.width >= dimensions.height * 1.45 ? 256 : DISC_SIZE;
  const source = createCanvas(sourceWidth, sourceHeight);
  const context = source.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, source.width, source.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(texture.image, 0, 0, source.width, source.height);

  if (dimensions.width >= dimensions.height * 1.45) {
    const disc = recoverLegacyPolarDisc(source);
    return disc ? { disc, sourceFormat: 'legacy-polar-equirectangular' } : null;
  }

  const disc = createCanvas(DISC_SIZE, DISC_SIZE);
  const discContext = disc.getContext('2d', { alpha: false });
  if (!discContext) return null;
  discContext.fillStyle = '#ffffff';
  discContext.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  discContext.imageSmoothingEnabled = true;
  discContext.drawImage(source, 0, 0, DISC_SIZE, DISC_SIZE);
  return { disc, sourceFormat: 'kid-disc' };
}

function gridIndex(x, y, width) {
  return y * width + x;
}

function dilate(mask, width, height, radiusX = 1, radiusY = 1, wrapX = false) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dy = -radiusY; dy <= radiusY && !on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radiusX; dx <= radiusX; dx += 1) {
          let nx = x + dx;
          if (wrapX) nx = (nx + width) % width;
          if (nx < 0 || nx >= width) continue;
          if (mask[gridIndex(nx, ny, width)]) {
            on = 1;
            break;
          }
        }
      }
      output[gridIndex(x, y, width)] = on;
    }
  }
  return output;
}

function erode(mask, width, height, radiusX = 1, radiusY = 1, wrapX = false) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 1;
      for (let dy = -radiusY; dy <= radiusY && on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          on = 0;
          break;
        }
        for (let dx = -radiusX; dx <= radiusX; dx += 1) {
          let nx = x + dx;
          if (wrapX) nx = (nx + width) % width;
          if (nx < 0 || nx >= width || !mask[gridIndex(nx, ny, width)]) {
            on = 0;
            break;
          }
        }
      }
      output[gridIndex(x, y, width)] = on;
    }
  }
  return output;
}

function cleanComponents(mask, width, height, minimumCells) {
  const visited = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  let componentCount = 0;
  const neighbours = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = gridIndex(x, y, width);
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      const component = [];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        component.push(current);
        const cy = Math.floor(current / width);
        const cx = current % width;
        neighbours.forEach(([dx, dy]) => {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
          const next = gridIndex(nx, ny, width);
          if (!mask[next] || visited[next]) return;
          visited[next] = 1;
          queue.push(next);
        });
      }
      if (component.length < minimumCells) continue;
      componentCount += 1;
      component.forEach((index) => {
        output[index] = 1;
      });
    }
  }

  return { mask: output, componentCount };
}

function paintedCoverage(masks) {
  if (!masks.length) return 0;
  const combined = new Uint8Array(masks[0].length);
  masks.forEach(({ mask }) => {
    mask.forEach((on, index) => {
      if (on) combined[index] = 1;
    });
  });
  let painted = 0;
  combined.forEach((on) => {
    painted += on;
  });
  return painted / combined.length;
}

function colourFromAverage(sum, count, fallback) {
  if (!count) return new THREE.Color(...fallback.map((value) => value / 255));
  return new THREE.Color(sum[0] / count / 255, sum[1] / count / 255, sum[2] / count / 255);
}

function analyseDisc(disc) {
  const gridCanvas = createCanvas(DISC_GRID, DISC_GRID);
  const context = gridCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, DISC_GRID, DISC_GRID);
  context.imageSmoothingEnabled = true;
  context.drawImage(disc, 0, 0, DISC_GRID, DISC_GRID);
  const pixels = context.getImageData(0, 0, DISC_GRID, DISC_GRID).data;

  const counts = new Array(TABLET_PALETTE.length).fill(0);
  const sums = TABLET_PALETTE.map(() => [0, 0, 0]);
  const rawLabels = new Int16Array(DISC_GRID * DISC_GRID);
  rawLabels.fill(-1);
  let paintedCells = 0;
  let insideCells = 0;

  for (let y = 0; y < DISC_GRID; y += 1) {
    for (let x = 0; x < DISC_GRID; x += 1) {
      const nx = ((x + 0.5) / DISC_GRID - 0.5) * 2;
      const ny = ((y + 0.5) / DISC_GRID - 0.5) * 2;
      if (nx * nx + ny * ny > 0.98 * 0.98) continue;
      insideCells += 1;
      const pixel = gridIndex(x, y, DISC_GRID) * 4;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      if (paintPresence(r, g, b) < 0.34) continue;
      const paletteIndex = nearestPaletteIndex(r, g, b);
      rawLabels[gridIndex(x, y, DISC_GRID)] = paletteIndex;
      counts[paletteIndex] += 1;
      sums[paletteIndex][0] += r;
      sums[paletteIndex][1] += g;
      sums[paletteIndex][2] += b;
      paintedCells += 1;
    }
  }

  let dominantIndex = 0;
  counts.forEach((count, index) => {
    if (count > counts[dominantIndex]) dominantIndex = index;
  });
  const hasPaint = paintedCells >= Math.max(8, insideCells * 0.006);
  const bodyColor = hasPaint
    ? colourFromAverage(sums[dominantIndex], counts[dominantIndex], TABLET_PALETTE[dominantIndex])
        .offsetHSL(0, 0.025, 0.015)
    : new THREE.Color(BASE_CLAY_COLOR);

  let selected = counts
    .map((count, index) => ({ count, index }))
    .filter(({ count, index }) => count >= Math.max(3, insideCells * 0.0025) && index !== dominantIndex)
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_ACCENT_COLORS)
    .map(({ index }) => index);

  const selfAccent = hasPaint && selected.length === 0;
  if (selfAccent) selected = [dominantIndex];

  const colours = new Map();
  selected.forEach((index) => {
    colours.set(
      index,
      colourFromAverage(sums[index], counts[index], TABLET_PALETTE[index]),
    );
  });

  let componentCount = 0;
  let masks = selected.map((paletteIndex) => {
    let mask = new Uint8Array(DISC_GRID * DISC_GRID);
    rawLabels.forEach((label, index) => {
      if (label === paletteIndex) mask[index] = 1;
    });
    mask = erode(dilate(mask, DISC_GRID, DISC_GRID, 2, 2), DISC_GRID, DISC_GRID, 1, 1);
    mask = dilate(mask, DISC_GRID, DISC_GRID, 1, 1);
    const cleaned = cleanComponents(mask, DISC_GRID, DISC_GRID, MIN_COMPONENT_CELLS);
    componentCount += cleaned.componentCount;
    return { paletteIndex, mask: cleaned.mask };
  });

  let coverage = paintedCoverage(masks);
  let passes = 0;
  while (coverage > MAX_ACCENT_COVERAGE && passes < 5) {
    masks = masks.map(({ paletteIndex, mask }) => ({
      paletteIndex,
      mask: erode(mask, DISC_GRID, DISC_GRID, 1, 1),
    }));
    coverage = paintedCoverage(masks);
    passes += 1;
  }
  passes = 0;
  while (masks.length && coverage < MIN_ACCENT_COVERAGE && passes < 3) {
    const expanded = masks.map(({ paletteIndex, mask }) => ({
      paletteIndex,
      mask: dilate(mask, DISC_GRID, DISC_GRID, 1, 1),
    }));
    const expandedCoverage = paintedCoverage(expanded);
    if (expandedCoverage > MAX_ACCENT_COVERAGE) break;
    masks = expanded;
    coverage = expandedCoverage;
    passes += 1;
  }

  return {
    bodyColor,
    dominantIndex,
    selected,
    colours,
    masks,
    selfAccent,
    sourcePaintCoverage: insideCells ? paintedCells / insideCells : 0,
    componentCount,
  };
}

function sampleMask(mask, x, y) {
  const gx = Math.round((0.5 + x * 0.485) * (DISC_GRID - 1));
  const gy = Math.round((0.5 - y * 0.485) * (DISC_GRID - 1));
  if (gx < 0 || gx >= DISC_GRID || gy < 0 || gy >= DISC_GRID) return false;
  return Boolean(mask[gridIndex(gx, gy, DISC_GRID)]);
}

function projectDesignToSphere(entity, analysis) {
  const labels = new Int16Array(MAP_GRID_WIDTH * MAP_GRID_HEIGHT);
  labels.fill(-1);
  const seed = entity.animator.hashId(`${entity.id}-kid-design-back`);
  const backAngle = 0.22 + entity.seededUnit(seed, 5) * 0.42;
  const cosine = Math.cos(backAngle);
  const sine = Math.sin(backAngle);

  for (let y = 0; y < MAP_GRID_HEIGHT; y += 1) {
    const v = (y + 0.5) / MAP_GRID_HEIGHT;
    const latitude = (0.5 - v) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    const sphereY = Math.sin(latitude);
    for (let x = 0; x < MAP_GRID_WIDTH; x += 1) {
      const u = (x + 0.5) / MAP_GRID_WIDTH;
      const longitude = (u - 0.5) * Math.PI * 2;
      let discX = Math.sin(longitude) * cosLatitude;
      let discY = sphereY;
      const front = Math.cos(longitude) * cosLatitude >= 0;

      // The child's disc is the recognizable front view. The far hemisphere
      // reuses the same visual language with a deterministic mirror/rotation,
      // so a child never has to paint invisible faces of a sphere.
      if (!front) {
        const mirroredX = -discX;
        const rotatedX = mirroredX * cosine - discY * sine;
        const rotatedY = mirroredX * sine + discY * cosine;
        discX = rotatedX * 0.96;
        discY = rotatedY * 0.96;
      }

      for (const { paletteIndex, mask } of analysis.masks) {
        if (!sampleMask(mask, discX, discY)) continue;
        labels[gridIndex(x, y, MAP_GRID_WIDTH)] = paletteIndex;
        break;
      }
    }
  }

  return labels;
}

function maskCanvas(mask, width, height) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return canvas;
  const image = context.createImageData(width, height);
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

function upscaleCanvas(source, width, height) {
  const output = createCanvas(width, height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;
  context.imageSmoothingEnabled = true;
  context.drawImage(source, 0, 0, width, height);
  return output;
}

function softenedCanvas(source, blur) {
  const output = createCanvas(source.width, source.height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;
  context.imageSmoothingEnabled = true;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, output.width, output.height);
  if ('filter' in context) context.filter = `blur(${blur}px)`;
  context.drawImage(source, 0, 0);
  if ('filter' in context) context.filter = 'none';
  return output;
}

function roundedReliefCanvas(maskSmall) {
  const hard = upscaleCanvas(maskSmall, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const soft = softenedCanvas(hard, 6.2);
  const output = createCanvas(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return soft;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.globalAlpha = 0.68;
  context.drawImage(soft, 0, 0);
  context.globalAlpha = 0.48;
  context.drawImage(hard, 0, 0);
  context.globalAlpha = 1;
  return output;
}

function colourCanvases(labels, analysis) {
  const top = createCanvas(MAP_GRID_WIDTH, MAP_GRID_HEIGHT);
  const edge = createCanvas(MAP_GRID_WIDTH, MAP_GRID_HEIGHT);
  const topContext = top.getContext('2d', { alpha: false });
  const edgeContext = edge.getContext('2d', { alpha: false });
  if (!topContext || !edgeContext) return null;
  const topImage = topContext.createImageData(MAP_GRID_WIDTH, MAP_GRID_HEIGHT);
  const edgeImage = edgeContext.createImageData(MAP_GRID_WIDTH, MAP_GRID_HEIGHT);

  labels.forEach((paletteIndex, index) => {
    const pixel = index * 4;
    if (paletteIndex < 0) {
      topImage.data[pixel] = 255;
      topImage.data[pixel + 1] = 255;
      topImage.data[pixel + 2] = 255;
      topImage.data[pixel + 3] = 255;
      edgeImage.data[pixel] = 255;
      edgeImage.data[pixel + 1] = 255;
      edgeImage.data[pixel + 2] = 255;
      edgeImage.data[pixel + 3] = 255;
      return;
    }

    const source = analysis.colours.get(paletteIndex) || new THREE.Color(TABLET_PALETTE[paletteIndex][0] / 255, TABLET_PALETTE[paletteIndex][1] / 255, TABLET_PALETTE[paletteIndex][2] / 255);
    const self = analysis.selfAccent && paletteIndex === analysis.dominantIndex;
    const topColour = source.clone().offsetHSL(0, 0.025, self ? 0.13 : 0.045);
    const edgeColour = source.clone().offsetHSL(0, -0.01, self ? -0.045 : -0.12);
    topImage.data[pixel] = Math.round(topColour.r * 255);
    topImage.data[pixel + 1] = Math.round(topColour.g * 255);
    topImage.data[pixel + 2] = Math.round(topColour.b * 255);
    topImage.data[pixel + 3] = 255;
    edgeImage.data[pixel] = Math.round(edgeColour.r * 255);
    edgeImage.data[pixel + 1] = Math.round(edgeColour.g * 255);
    edgeImage.data[pixel + 2] = Math.round(edgeColour.b * 255);
    edgeImage.data[pixel + 3] = 255;
  });

  topContext.putImageData(topImage, 0, 0);
  edgeContext.putImageData(edgeImage, 0, 0);
  return { top, edge };
}

function textureFromCanvas(canvas, colorSpace, renderer) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function disposeExistingMaterialTextures(materials) {
  const textures = new Set();
  materials.forEach((material) => {
    ['map', 'alphaMap', 'bumpMap', 'displacementMap', 'normalMap', 'roughnessMap'].forEach((key) => {
      if (material?.[key]) textures.add(material[key]);
    });
  });
  textures.forEach((texture) => texture.dispose());
}

function applyKidArtwork(entity, sourceTexture) {
  const recovered = recoverKidDisc(sourceTexture);
  if (!recovered) return null;
  const analysis = analyseDisc(recovered.disc);
  if (!analysis) return null;

  const labels = projectDesignToSphere(entity, analysis);
  const hardMask = new Uint8Array(labels.length);
  let accentCells = 0;
  labels.forEach((label, index) => {
    if (label < 0) return;
    hardMask[index] = 1;
    accentCells += 1;
  });
  const edgeMaskBinary = dilate(
    hardMask,
    MAP_GRID_WIDTH,
    MAP_GRID_HEIGHT,
    2,
    1,
    true,
  );
  const colourMaps = colourCanvases(labels, analysis);
  if (!colourMaps) return null;

  const hardMaskCanvas = maskCanvas(hardMask, MAP_GRID_WIDTH, MAP_GRID_HEIGHT);
  const edgeMaskCanvas = maskCanvas(edgeMaskBinary, MAP_GRID_WIDTH, MAP_GRID_HEIGHT);
  const topMaskCanvas = softenedCanvas(
    upscaleCanvas(hardMaskCanvas, TEXTURE_WIDTH, TEXTURE_HEIGHT),
    1.7,
  );
  const edgeMaskLarge = softenedCanvas(
    upscaleCanvas(edgeMaskCanvas, TEXTURE_WIDTH, TEXTURE_HEIGHT),
    3.2,
  );
  const reliefCanvas = roundedReliefCanvas(hardMaskCanvas);
  const topColourCanvas = softenedCanvas(
    upscaleCanvas(colourMaps.top, TEXTURE_WIDTH, TEXTURE_HEIGHT),
    0.55,
  );
  const edgeColourCanvas = softenedCanvas(
    upscaleCanvas(colourMaps.edge, TEXTURE_WIDTH, TEXTURE_HEIGHT),
    0.8,
  );

  const renderer = entity.scene.renderer;
  const topMask = textureFromCanvas(topMaskCanvas, THREE.NoColorSpace, renderer);
  const edgeMask = textureFromCanvas(edgeMaskLarge, THREE.NoColorSpace, renderer);
  const relief = textureFromCanvas(reliefCanvas, THREE.NoColorSpace, renderer);
  const topColour = textureFromCanvas(topColourCanvas, THREE.SRGBColorSpace, renderer);
  const edgeColour = textureFromCanvas(edgeColourCanvas, THREE.SRGBColorSpace, renderer);

  disposeExistingMaterialTextures([
    entity.mesh.material,
    entity.accentEdgeMesh.material,
    entity.accentMesh.material,
  ]);

  const baseMaterial = entity.mesh.material;
  baseMaterial.map = null;
  baseMaterial.bumpMap = null;
  baseMaterial.displacementMap = null;
  baseMaterial.color.copy(analysis.bodyColor);
  baseMaterial.roughness = 0.43;
  baseMaterial.metalness = 0.002;
  baseMaterial.clearcoat = 0.08;
  baseMaterial.clearcoatRoughness = 0.56;
  baseMaterial.emissive.setHex(0x000000);
  baseMaterial.emissiveIntensity = 0;
  baseMaterial.userData.kidsGalaxyKidDesignProjection = true;
  baseMaterial.userData.kidsGalaxyReferenceSurface = true;
  baseMaterial.userData.sourceArtworkFormat = recovered.sourceFormat;
  baseMaterial.userData.designProjection = 'recognizable-front-with-styled-back-echo';
  baseMaterial.userData.sourcePaintCoverage = analysis.sourcePaintCoverage;
  baseMaterial.userData.accentCoverage = accentCells / labels.length;
  baseMaterial.userData.accentColorCount = analysis.selected.length;
  baseMaterial.userData.componentCount = analysis.componentCount;
  baseMaterial.userData.bodyFromChildDrawing = true;
  baseMaterial.needsUpdate = true;

  const edgeMaterial = entity.accentEdgeMesh.material;
  edgeMaterial.map = edgeColour;
  edgeMaterial.alphaMap = edgeMask;
  edgeMaterial.bumpMap = relief;
  edgeMaterial.bumpScale = 0.034;
  edgeMaterial.color.setHex(0xffffff);
  edgeMaterial.roughness = 0.49;
  edgeMaterial.clearcoat = 0.075;
  edgeMaterial.clearcoatRoughness = 0.62;
  edgeMaterial.alphaTest = 0.1;
  edgeMaterial.transparent = false;
  edgeMaterial.depthWrite = true;
  edgeMaterial.userData.kidsGalaxySameHueShoulder = true;
  edgeMaterial.needsUpdate = true;

  const accentMaterial = entity.accentMesh.material;
  accentMaterial.map = topColour;
  accentMaterial.alphaMap = topMask;
  accentMaterial.bumpMap = relief;
  accentMaterial.bumpScale = 0.068;
  accentMaterial.displacementMap = relief;
  accentMaterial.displacementScale = 0.034;
  accentMaterial.displacementBias = -0.003;
  accentMaterial.color.setHex(0xffffff);
  accentMaterial.roughness = 0.36;
  accentMaterial.clearcoat = 0.14;
  accentMaterial.clearcoatRoughness = 0.46;
  accentMaterial.alphaTest = 0.2;
  accentMaterial.transparent = false;
  accentMaterial.depthWrite = true;
  accentMaterial.emissive.setHex(0x000000);
  accentMaterial.emissiveIntensity = 0;
  accentMaterial.userData.kidsGalaxyRoundedMoldedTop = true;
  accentMaterial.userData.kidsGalaxyPreservesKidGesture = true;
  accentMaterial.needsUpdate = true;

  sourceTexture.dispose();
  return {
    topMask,
    edgeMask,
    relief,
    topColour,
    edgeColour,
    accentCells,
    sourceFormat: recovered.sourceFormat,
  };
}

/**
 * Replace the old texture interpretation with a drawing-preserving pipeline.
 *
 * New tablets upload the actual square drawing disc. Existing 2:1 planet PNGs
 * are decoded back from the former polar mapping first, so already-stored
 * planets immediately benefit from the same recognizable front-view design.
 */
export function installKidArtworkUpgrade() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyKidArtworkUpgrade) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function kidArtworkApplyTexture(texture) {
    if (this.disposed) {
      texture.dispose();
      return;
    }

    try {
      const artwork = applyKidArtwork(this, texture);
      if (!artwork) {
        previousApplyTexture.call(this, texture);
        return;
      }
      this.reliefMap = artwork.relief;
      this.accentMask = artwork.topMask;
      const hasAccents = artwork.accentCells > 0;
      this.accentEdgeMesh.visible = hasAccents;
      this.accentMesh.visible = hasAccents;
    } catch (_error) {
      previousApplyTexture.call(this, texture);
    }
  }

  kidArtworkApplyTexture.kidsGalaxyKidArtworkUpgrade = true;
  PlanetEntity.prototype.applyTexture = kidArtworkApplyTexture;
}
