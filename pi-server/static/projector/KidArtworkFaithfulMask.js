import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const DISC_SIZE = 256;
const MAP_WIDTH = 512;
const MAP_HEIGHT = 256;
const MAX_ACCENT_COLORS = 3;
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

function imageDimensions(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 0,
  };
}

function paintPresence(r, g, b) {
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
}

function nearestPaletteIndex(r, g, b) {
  let result = 0;
  let best = Number.POSITIVE_INFINITY;
  TABLET_PALETTE.forEach((rgb, index) => {
    const dr = r - rgb[0];
    const dg = g - rgb[1];
    const db = b - rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance >= best) return;
    best = distance;
    result = index;
  });
  return result;
}

function recoverLegacyDisc(source) {
  const context = source.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  const sourcePixels = context.getImageData(0, 0, source.width, source.height).data;
  const disc = createCanvas(DISC_SIZE, DISC_SIZE);
  const discContext = disc.getContext('2d', { alpha: false });
  if (!discContext) return null;
  const output = discContext.createImageData(DISC_SIZE, DISC_SIZE);
  const centre = (DISC_SIZE - 1) / 2;
  const radius = DISC_SIZE * 0.485;

  for (let y = 0; y < DISC_SIZE; y += 1) {
    for (let x = 0; x < DISC_SIZE; x += 1) {
      const nx = (x - centre) / radius;
      const ny = (y - centre) / radius;
      const radial = Math.hypot(nx, ny);
      const destination = (y * DISC_SIZE + x) * 4;
      if (radial > 1) {
        output.data[destination] = 255;
        output.data[destination + 1] = 255;
        output.data[destination + 2] = 255;
        output.data[destination + 3] = 255;
        continue;
      }
      let longitude = Math.atan2(ny, nx) / (Math.PI * 2);
      if (longitude < 0) longitude += 1;
      const sx = Math.min(source.width - 1, Math.floor(longitude * source.width));
      const sy = Math.min(source.height - 1, Math.floor(radial * source.height));
      const sourceIndex = (sy * source.width + sx) * 4;
      output.data[destination] = sourcePixels[sourceIndex];
      output.data[destination + 1] = sourcePixels[sourceIndex + 1];
      output.data[destination + 2] = sourcePixels[sourceIndex + 2];
      output.data[destination + 3] = 255;
    }
  }
  discContext.putImageData(output, 0, 0);
  return disc;
}

function recoverDisc(texture) {
  if (typeof document === 'undefined' || !texture?.image) return null;
  const dimensions = imageDimensions(texture.image);
  if (!dimensions.width || !dimensions.height) return null;

  const legacy = dimensions.width >= dimensions.height * 1.45;
  const source = createCanvas(legacy ? 512 : DISC_SIZE, legacy ? 256 : DISC_SIZE);
  const sourceContext = source.getContext('2d', { alpha: false });
  if (!sourceContext) return null;
  sourceContext.fillStyle = '#ffffff';
  sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.drawImage(texture.image, 0, 0, source.width, source.height);
  if (legacy) return recoverLegacyDisc(source);

  const disc = createCanvas(DISC_SIZE, DISC_SIZE);
  const context = disc.getContext('2d', { alpha: false });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  context.imageSmoothingEnabled = true;
  context.drawImage(source, 0, 0, DISC_SIZE, DISC_SIZE);
  return disc;
}

function analyseDisc(disc) {
  const context = disc.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, DISC_SIZE, DISC_SIZE).data;
  const counts = new Array(TABLET_PALETTE.length).fill(0);
  const centre = (DISC_SIZE - 1) / 2;
  const radius = DISC_SIZE * 0.485;

  for (let y = 0; y < DISC_SIZE; y += 1) {
    for (let x = 0; x < DISC_SIZE; x += 1) {
      const dx = (x - centre) / radius;
      const dy = (y - centre) / radius;
      if (dx * dx + dy * dy > 1) continue;
      const pixel = (y * DISC_SIZE + x) * 4;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      if (paintPresence(r, g, b) < 0.12) continue;
      counts[nearestPaletteIndex(r, g, b)] += 1;
    }
  }

  let dominant = 0;
  counts.forEach((count, index) => {
    if (count > counts[dominant]) dominant = index;
  });
  let accents = counts
    .map((count, index) => ({ count, index }))
    .filter(({ count, index }) => count >= 14 && index !== dominant)
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_ACCENT_COLORS)
    .map(({ index }) => index);
  const selfAccent = accents.length === 0 && counts[dominant] > 0;
  if (selfAccent) accents = [dominant];
  return { pixels, dominant, accents, selfAccent };
}

function sampleDisc(analysis, x, y) {
  if (x * x + y * y > 1) return null;
  const radius = DISC_SIZE * 0.485;
  const centre = (DISC_SIZE - 1) / 2;
  const px = Math.max(0, Math.min(DISC_SIZE - 1, Math.round(centre + x * radius)));
  const py = Math.max(0, Math.min(DISC_SIZE - 1, Math.round(centre - y * radius)));
  const index = (py * DISC_SIZE + px) * 4;
  const r = analysis.pixels[index];
  const g = analysis.pixels[index + 1];
  const b = analysis.pixels[index + 2];
  if (paintPresence(r, g, b) < 0.12) return null;
  const paletteIndex = nearestPaletteIndex(r, g, b);
  if (!analysis.accents.includes(paletteIndex)) return null;
  return { r, g, b, paletteIndex };
}

function shadeRgb(sample, lightness) {
  const color = new THREE.Color().setRGB(
    sample.r / 255,
    sample.g / 255,
    sample.b / 255,
    THREE.SRGBColorSpace,
  );
  color.offsetHSL(0, lightness > 0 ? 0.015 : -0.015, lightness);
  color.convertLinearToSRGB();
  return [
    Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255),
    Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255),
    Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255),
  ];
}

function buildMaps(entity, analysis) {
  const maskCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
  const topCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
  const edgeCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
  const maskContext = maskCanvas.getContext('2d', { alpha: false });
  const topContext = topCanvas.getContext('2d', { alpha: false });
  const edgeContext = edgeCanvas.getContext('2d', { alpha: false });
  if (!maskContext || !topContext || !edgeContext) return null;

  const mask = maskContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const top = topContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const edge = edgeContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const seed = entity.animator.hashId(`${entity.id}-faithful-kid-back`);
  const angle = 0.2 + entity.seededUnit(seed, 4) * 0.34;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  let accentPixels = 0;

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    const v = (y + 0.5) / MAP_HEIGHT;
    const latitude = (0.5 - v) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    const sphereY = Math.sin(latitude);
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const u = (x + 0.5) / MAP_WIDTH;
      const longitude = (u - 0.5) * Math.PI * 2;
      let discX = Math.sin(longitude) * cosLatitude;
      let discY = sphereY;
      const front = Math.cos(longitude) * cosLatitude >= 0;
      if (!front) {
        const mirrored = -discX;
        discX = (mirrored * cosine - discY * sine) * 0.96;
        discY = (mirrored * sine + discY * cosine) * 0.96;
      }

      const sample = sampleDisc(analysis, discX, discY);
      const index = (y * MAP_WIDTH + x) * 4;
      if (!sample) {
        mask.data[index] = 0;
        mask.data[index + 1] = 0;
        mask.data[index + 2] = 0;
        mask.data[index + 3] = 255;
        // Dark body-like backing prevents any pale fringe if filtering samples
        // just outside the alpha silhouette.
        top.data[index] = 20;
        top.data[index + 1] = 28;
        top.data[index + 2] = 36;
        top.data[index + 3] = 255;
        edge.data[index] = 16;
        edge.data[index + 1] = 22;
        edge.data[index + 2] = 28;
        edge.data[index + 3] = 255;
        continue;
      }

      accentPixels += 1;
      const topRgb = shadeRgb(sample, analysis.selfAccent ? 0.12 : 0.035);
      const edgeRgb = shadeRgb(sample, analysis.selfAccent ? -0.06 : -0.11);
      mask.data[index] = 255;
      mask.data[index + 1] = 255;
      mask.data[index + 2] = 255;
      mask.data[index + 3] = 255;
      top.data[index] = topRgb[0];
      top.data[index + 1] = topRgb[1];
      top.data[index + 2] = topRgb[2];
      top.data[index + 3] = 255;
      edge.data[index] = edgeRgb[0];
      edge.data[index + 1] = edgeRgb[1];
      edge.data[index + 2] = edgeRgb[2];
      edge.data[index + 3] = 255;
    }
  }

  maskContext.putImageData(mask, 0, 0);
  topContext.putImageData(top, 0, 0);
  edgeContext.putImageData(edge, 0, 0);
  return { maskCanvas, topCanvas, edgeCanvas, accentPixels };
}

function blurCanvas(source, blurPixels) {
  const output = createCanvas(source.width, source.height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, output.width, output.height);
  if ('filter' in context) context.filter = `blur(${blurPixels}px)`;
  context.drawImage(source, 0, 0);
  if ('filter' in context) context.filter = 'none';
  return output;
}

function canvasTexture(canvas, colorSpace, renderer) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function disposeMaterialTextures(materials) {
  const textures = new Set();
  materials.forEach((material) => {
    ['map', 'alphaMap', 'bumpMap', 'displacementMap'].forEach((key) => {
      if (material?.[key]) textures.add(material[key]);
    });
  });
  textures.forEach((texture) => texture.dispose());
}

function applyFaithfulMasks(entity, texture) {
  const disc = recoverDisc(texture);
  if (!disc) return false;
  const analysis = analyseDisc(disc);
  if (!analysis || !analysis.accents.length) return false;
  const maps = buildMaps(entity, analysis);
  if (!maps || maps.accentPixels === 0) return false;

  const renderer = entity.scene.renderer;
  const softMask = canvasTexture(blurCanvas(maps.maskCanvas, 1.25), THREE.NoColorSpace, renderer);
  const relief = canvasTexture(blurCanvas(maps.maskCanvas, 3.8), THREE.NoColorSpace, renderer);
  const topColour = canvasTexture(maps.topCanvas, THREE.SRGBColorSpace, renderer);
  const edgeColour = canvasTexture(maps.edgeCanvas, THREE.SRGBColorSpace, renderer);

  disposeMaterialTextures([entity.accentEdgeMesh.material, entity.accentMesh.material]);
  const edge = entity.accentEdgeMesh.material;
  edge.map = edgeColour;
  edge.alphaMap = softMask;
  edge.bumpMap = relief;
  edge.bumpScale = 0.026;
  edge.alphaTest = 0.16;
  edge.color.setHex(0xffffff);
  edge.roughness = 0.43;
  edge.clearcoat = 0.075;
  edge.clearcoatRoughness = 0.58;
  edge.userData.kidsGalaxyFaithfulKidDrawing = true;
  edge.needsUpdate = true;

  const top = entity.accentMesh.material;
  top.map = topColour;
  top.alphaMap = softMask;
  top.bumpMap = relief;
  top.bumpScale = 0.038;
  top.displacementMap = relief;
  top.displacementScale = 0.018;
  top.displacementBias = -0.0015;
  top.alphaTest = 0.17;
  top.color.setHex(0xffffff);
  top.roughness = 0.32;
  top.clearcoat = 0.12;
  top.clearcoatRoughness = 0.42;
  top.userData.kidsGalaxyFaithfulKidDrawing = true;
  top.userData.kidsGalaxyPreservesKidGesture = true;
  top.needsUpdate = true;

  entity.accentEdgeMesh.visible = true;
  entity.accentMesh.visible = true;
  entity.mesh.material.userData.kidsGalaxyFaithfulKidDrawing = true;
  entity.mesh.material.userData.kidsGalaxyFaithfulAccentPixels = maps.accentPixels;
  entity.mesh.material.userData.kidsGalaxyAccentMorphology = 'none-shape-preserving';
  return true;
}

/** Replace morphology-merged accents with the child's actual individual forms. */
export function installKidArtworkFaithfulMask() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyKidArtworkFaithfulMask) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function faithfulKidArtwork(texture) {
    previousApplyTexture.call(this, texture);
    if (!this.mesh.material.userData?.kidsGalaxyKidDesignProjection) return;
    try {
      applyFaithfulMasks(this, texture);
    } catch (_error) {
      // The previous artwork renderer remains a complete fallback.
    }
  }

  faithfulKidArtwork.kidsGalaxyKidArtworkFaithfulMask = true;
  PlanetEntity.prototype.applyTexture = faithfulKidArtwork;
}
