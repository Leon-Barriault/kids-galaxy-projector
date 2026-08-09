import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const DISC_SIZE = 256;
const MAP_WIDTH = 512;
const MAP_HEIGHT = 256;
const MAX_ACCENTS = 3;
const FRONT_HALF_LONGITUDE = 0.205;
const FRONT_HALF_LATITUDE = 0.335;
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

function dimensions(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 0,
  };
}

function distanceFromWhite(r, g, b) {
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
}

function paletteIndex(r, g, b) {
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  PALETTE.forEach((entry, index) => {
    const dr = r - entry[0];
    const dg = g - entry[1];
    const db = b - entry[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance >= best) return;
    best = distance;
    nearest = index;
  });
  return nearest;
}

function legacyDisc(source) {
  const sourceContext = source.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!sourceContext) return null;
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
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
      const target = (y * DISC_SIZE + x) * 4;
      if (radial > 1) {
        pixels.data[target] = 255;
        pixels.data[target + 1] = 255;
        pixels.data[target + 2] = 255;
        pixels.data[target + 3] = 255;
        continue;
      }
      let longitude = Math.atan2(ny, nx) / (Math.PI * 2);
      if (longitude < 0) longitude += 1;
      const sx = Math.min(source.width - 1, Math.floor(longitude * source.width));
      const sy = Math.min(source.height - 1, Math.floor(radial * source.height));
      const sourceIndex = (sy * source.width + sx) * 4;
      pixels.data[target] = sourcePixels[sourceIndex];
      pixels.data[target + 1] = sourcePixels[sourceIndex + 1];
      pixels.data[target + 2] = sourcePixels[sourceIndex + 2];
      pixels.data[target + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return output;
}

function recoverDisc(texture) {
  if (!texture?.image || typeof document === 'undefined') return null;
  const size = dimensions(texture.image);
  if (!size.width || !size.height) return null;
  const legacy = size.width >= size.height * 1.45;
  const source = canvas(legacy ? 512 : DISC_SIZE, legacy ? 256 : DISC_SIZE);
  const context = source.getContext('2d', { alpha: false });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, source.width, source.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(texture.image, 0, 0, source.width, source.height);
  if (legacy) return legacyDisc(source);

  const output = canvas(DISC_SIZE, DISC_SIZE);
  const outputContext = output.getContext('2d', { alpha: false });
  if (!outputContext) return null;
  outputContext.fillStyle = '#ffffff';
  outputContext.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  outputContext.imageSmoothingEnabled = true;
  outputContext.drawImage(source, 0, 0, DISC_SIZE, DISC_SIZE);
  return output;
}

function analyse(disc) {
  const context = disc.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, DISC_SIZE, DISC_SIZE).data;
  const counts = new Array(PALETTE.length).fill(0);

  // The tablet has already clipped real drawings to its circular planet guide.
  // Count every non-white pixel in the uploaded square instead of imposing a
  // second radial crop here. A second crop under-counted broad strokes near the
  // guide edge and could make this layer disagree with the base-body palette,
  // causing the body colour itself to be raised as a giant accent belt.
  for (let y = 0; y < DISC_SIZE; y += 1) {
    for (let x = 0; x < DISC_SIZE; x += 1) {
      const index = (y * DISC_SIZE + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      if (distanceFromWhite(r, g, b) < 0.08) continue;
      counts[paletteIndex(r, g, b)] += 1;
    }
  }

  let dominant = 0;
  counts.forEach((count, index) => {
    if (count > counts[dominant]) dominant = index;
  });
  let accents = counts
    .map((count, index) => ({ count, index }))
    .filter(({ count, index }) => count >= 12 && index !== dominant)
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_ACCENTS)
    .map(({ index }) => index);
  const selfAccent = accents.length === 0 && counts[dominant] > 0;
  if (selfAccent) accents = [dominant];
  return { pixels, dominant, accents, selfAccent };
}

function sample(analysis, x, y) {
  if (x * x + y * y > 1) return null;
  const centre = (DISC_SIZE - 1) / 2;
  const radius = DISC_SIZE * 0.485;
  const px = Math.max(0, Math.min(DISC_SIZE - 1, Math.round(centre + x * radius)));
  const py = Math.max(0, Math.min(DISC_SIZE - 1, Math.round(centre - y * radius)));
  const index = (py * DISC_SIZE + px) * 4;
  const r = analysis.pixels[index];
  const g = analysis.pixels[index + 1];
  const b = analysis.pixels[index + 2];
  if (distanceFromWhite(r, g, b) < 0.08) return null;
  const indexInPalette = paletteIndex(r, g, b);
  if (!analysis.accents.includes(indexInPalette)) return null;
  return { r, g, b };
}

function wrapSigned(value) {
  let result = value;
  while (result > 0.5) result -= 1;
  while (result < -0.5) result += 1;
  return result;
}

function sampleMotif(analysis, u, v, backAngle) {
  const frontU = wrapSigned(u - 0.5);
  const frontV = 0.5 - v;
  if (Math.abs(frontU) <= FRONT_HALF_LONGITUDE && Math.abs(frontV) <= FRONT_HALF_LATITUDE) {
    return sample(
      analysis,
      frontU / FRONT_HALF_LONGITUDE,
      frontV / FRONT_HALF_LATITUDE,
    );
  }

  const backU = wrapSigned(u);
  const backV = 0.5 - v;
  if (Math.abs(backU) > BACK_HALF_LONGITUDE || Math.abs(backV) > BACK_HALF_LATITUDE) {
    return null;
  }
  const x = -backU / BACK_HALF_LONGITUDE;
  const y = backV / BACK_HALF_LATITUDE;
  const cosine = Math.cos(backAngle);
  const sine = Math.sin(backAngle);
  return sample(
    analysis,
    (x * cosine - y * sine) * 0.94,
    (x * sine + y * cosine) * 0.94,
  );
}

function toned(sampled, factor, lift = 0) {
  return [sampled.r, sampled.g, sampled.b].map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel * factor + lift))),
  );
}

function buildMotifMaps(entity, analysis) {
  const maskCanvas = canvas(MAP_WIDTH, MAP_HEIGHT);
  const topCanvas = canvas(MAP_WIDTH, MAP_HEIGHT);
  const edgeCanvas = canvas(MAP_WIDTH, MAP_HEIGHT);
  const maskContext = maskCanvas.getContext('2d', { alpha: false });
  const topContext = topCanvas.getContext('2d', { alpha: false });
  const edgeContext = edgeCanvas.getContext('2d', { alpha: false });
  if (!maskContext || !topContext || !edgeContext) return null;
  const mask = maskContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const top = topContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const edge = edgeContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const seed = entity.animator.hashId(`${entity.id}-kid-motif-back`);
  const backAngle = 0.2 + entity.seededUnit(seed, 3) * 0.3;
  let accentPixels = 0;

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    const v = (y + 0.5) / MAP_HEIGHT;
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const u = (x + 0.5) / MAP_WIDTH;
      const sampled = sampleMotif(analysis, u, v, backAngle);
      const index = (y * MAP_WIDTH + x) * 4;
      if (!sampled) {
        mask.data[index] = 0;
        mask.data[index + 1] = 0;
        mask.data[index + 2] = 0;
        mask.data[index + 3] = 255;
        top.data[index] = 12;
        top.data[index + 1] = 18;
        top.data[index + 2] = 24;
        top.data[index + 3] = 255;
        edge.data[index] = 8;
        edge.data[index + 1] = 12;
        edge.data[index + 2] = 16;
        edge.data[index + 3] = 255;
        continue;
      }
      accentPixels += 1;
      const topRgb = toned(sampled, analysis.selfAccent ? 1.08 : 1.02, analysis.selfAccent ? 10 : 3);
      const edgeRgb = toned(sampled, analysis.selfAccent ? 0.72 : 0.68, 0);
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

function blurred(source, pixels) {
  const output = canvas(source.width, source.height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, output.width, output.height);
  if ('filter' in context) context.filter = `blur(${pixels}px)`;
  context.drawImage(source, 0, 0);
  if ('filter' in context) context.filter = 'none';
  return output;
}

function textureFrom(canvasSource, colorSpace, renderer) {
  const texture = new THREE.CanvasTexture(canvasSource);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function disposeTextures(materials) {
  const textures = new Set();
  materials.forEach((material) => {
    ['map', 'alphaMap', 'bumpMap', 'displacementMap'].forEach((key) => {
      if (material?.[key]) textures.add(material[key]);
    });
  });
  textures.forEach((texture) => texture.dispose());
}

function applyMotifProjection(entity, sourceTexture) {
  const disc = recoverDisc(sourceTexture);
  if (!disc) return false;
  const analysis = analyse(disc);
  if (!analysis?.accents?.length) return false;
  const maps = buildMotifMaps(entity, analysis);
  if (!maps?.accentPixels) return false;

  const renderer = entity.scene.renderer;
  const mask = textureFrom(blurred(maps.maskCanvas, 1.15), THREE.NoColorSpace, renderer);
  const relief = textureFrom(blurred(maps.maskCanvas, 3.2), THREE.NoColorSpace, renderer);
  const topColour = textureFrom(maps.topCanvas, THREE.SRGBColorSpace, renderer);
  const edgeColour = textureFrom(maps.edgeCanvas, THREE.SRGBColorSpace, renderer);
  disposeTextures([entity.accentEdgeMesh.material, entity.accentMesh.material]);

  const edge = entity.accentEdgeMesh.material;
  edge.map = edgeColour;
  edge.alphaMap = mask;
  edge.bumpMap = relief;
  edge.bumpScale = 0.024;
  edge.alphaTest = 0.18;
  edge.color.setHex(0xffffff);
  edge.roughness = 0.42;
  edge.clearcoat = 0.08;
  edge.clearcoatRoughness = 0.56;
  edge.userData.kidsGalaxyFaithfulKidDrawing = true;
  edge.userData.kidsGalaxyKidMotifProjection = true;
  edge.needsUpdate = true;

  const top = entity.accentMesh.material;
  top.map = topColour;
  top.alphaMap = mask;
  top.bumpMap = relief;
  top.bumpScale = 0.032;
  top.displacementMap = relief;
  top.displacementScale = 0.014;
  top.displacementBias = -0.001;
  top.alphaTest = 0.18;
  top.color.setHex(0xffffff);
  top.roughness = 0.31;
  top.clearcoat = 0.13;
  top.clearcoatRoughness = 0.4;
  top.userData.kidsGalaxyFaithfulKidDrawing = true;
  top.userData.kidsGalaxyPreservesKidGesture = true;
  top.userData.kidsGalaxyKidMotifProjection = true;
  top.needsUpdate = true;

  entity.accentEdgeMesh.visible = true;
  entity.accentMesh.visible = true;
  entity.mesh.material.userData.kidsGalaxyFaithfulKidDrawing = true;
  entity.mesh.material.userData.kidsGalaxyKidMotifProjection = true;
  entity.mesh.material.userData.kidsGalaxyKidDesignMapping = 'front-motif-and-smaller-back-echo';
  entity.mesh.material.userData.kidsGalaxyFaithfulAccentPixels = maps.accentPixels;
  entity.mesh.material.userData.kidsGalaxyMotifDominantPalette = analysis.dominant;
  entity.mesh.material.userData.kidsGalaxyMotifAccentPalettes = [...analysis.accents];
  return true;
}

/** Preserve the child's 2D composition instead of stretching it over a hemisphere. */
export function installKidArtworkMotifProjection() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyKidArtworkMotifProjection) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function motifKidArtwork(texture) {
    previousApplyTexture.call(this, texture);
    if (!this.mesh.material.userData?.kidsGalaxyKidDesignProjection) return;
    applyMotifProjection(this, texture);
  }

  motifKidArtwork.kidsGalaxyKidArtworkMotifProjection = true;
  PlanetEntity.prototype.applyTexture = motifKidArtwork;
}
