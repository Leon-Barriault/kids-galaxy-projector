import * as THREE from 'three';

/**
 * Pi-friendly sculpted-toy surface treatment.
 *
 * The projector no longer wraps the child's full PNG directly around the base
 * sphere. The sphere becomes a coherent clay body and the drawing is converted
 * once, at texture-load time, into rounded raised colour accents. Two concentric
 * accent shells create a darker bevel/side and a brighter rounded top, which is
 * much closer to the molded ribbons and blobs in the visual reference than a
 * painted balloon.
 */

const BASE_CLAY_COLOR = 0xf2ede6;

const TABLET_PALETTE = [
  { rgb: [0xe5, 0x39, 0x35], toy: 0xff6259 }, // red -> warm coral
  { rgb: [0xff, 0x98, 0x00], toy: 0xffa63f }, // orange
  { rgb: [0xff, 0xeb, 0x3b], toy: 0xffe566 }, // yellow
  { rgb: [0x4c, 0xaf, 0x50], toy: 0x62ca78 }, // green
  { rgb: [0x21, 0x96, 0xf3], toy: 0x55aaff }, // blue
  { rgb: [0x9c, 0x27, 0xb0], toy: 0xb25ed1 }, // purple
  { rgb: [0xe9, 0x1e, 0x63], toy: 0xf55f99 }, // pink
  { rgb: [0x00, 0x00, 0x00], toy: 0x41434d }, // black -> charcoal
];

export const POLISHED_SURFACE_PROFILE = Object.freeze({
  textureWidth: 256,
  textureHeight: 128,
  accentEdgeRadius: 1.068,
  accentRadius: 1.082,
  accentBumpScale: 0.068,
  accentDisplacementScale: 0.034,
  accentEdgeAlphaTest: 0.07,
  accentAlphaTest: 0.28,
  maxAnisotropy: 4,
  clearcoat: 0.06,
});

function paintPresence(r, g, b) {
  // White is the tablet's untouched surface. Antialiased brush edges remain a
  // gradient here and become the rounded shoulder of the molded accent.
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
      if (presence < 0.5) continue;
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
    const meaningfulColors = counts.filter((count) => count > pixelCount * 0.01).length;
    const dominantShare = paintedPixels > 0 ? counts[dominantIndex] / paintedPixels : 0;

    // A nearly filled multicolour drawing gets its dominant paint colour as the
    // body, with the remaining colours molded above it. Sparse drawings keep a
    // warm ivory clay body so every child stroke becomes a visible raised piece.
    const useDominantAsBody =
      coverage > 0.72 && meaningfulColors >= 2 && dominantShare > 0.38;
    const baseColor = useDominantAsBody
      ? TABLET_PALETTE[dominantIndex].toy
      : BASE_CLAY_COLOR;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskContext = maskCanvas.getContext('2d', { alpha: false });
    if (!maskContext) return null;
    const maskImage = maskContext.createImageData(width, height);

    const colourCanvas = document.createElement('canvas');
    colourCanvas.width = width;
    colourCanvas.height = height;
    const colourContext = colourCanvas.getContext('2d', { alpha: false });
    if (!colourContext) return null;
    const colourImage = colourContext.createImageData(width, height);

    for (let index = 0; index < sourcePixels.length; index += 4) {
      const r = sourcePixels[index];
      const g = sourcePixels[index + 1];
      const b = sourcePixels[index + 2];
      const paletteIndex = nearestPaletteIndex(r, g, b);
      let presence = paintPresence(r, g, b);
      if (useDominantAsBody && paletteIndex === dominantIndex) presence *= 0.02;

      const maskValue = Math.round(presence * 255);
      maskImage.data[index] = maskValue;
      maskImage.data[index + 1] = maskValue;
      maskImage.data[index + 2] = maskValue;
      maskImage.data[index + 3] = 255;

      const toy = new THREE.Color(TABLET_PALETTE[paletteIndex].toy);
      colourImage.data[index] = Math.round(toy.r * 255);
      colourImage.data[index + 1] = Math.round(toy.g * 255);
      colourImage.data[index + 2] = Math.round(toy.b * 255);
      colourImage.data[index + 3] = 255;
    }

    maskContext.putImageData(maskImage, 0, 0);
    colourContext.putImageData(colourImage, 0, 0);

    return {
      mask: textureFromCanvas(softenedCanvas(maskCanvas, 2.4), THREE.NoColorSpace),
      colour: textureFromCanvas(softenedCanvas(colourCanvas, 1.05), THREE.SRGBColorSpace),
      baseColor,
      coverage,
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
    roughness: 0.49,
    metalness: 0.003,
    clearcoat: POLISHED_SURFACE_PROFILE.clearcoat,
    clearcoatRoughness: 0.58,
  });
}

export function createMoldedAccentEdgeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc1b8b0,
    roughness: 0.61,
    metalness: 0.003,
    clearcoat: 0.03,
    clearcoatRoughness: 0.72,
    alphaTest: POLISHED_SURFACE_PROFILE.accentEdgeAlphaTest,
    transparent: false,
    depthWrite: true,
  });
}

export function createMoldedAccentMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.003,
    clearcoat: 0.1,
    clearcoatRoughness: 0.48,
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
  if (!artwork) {
    configureTexture(sourceTexture, renderer, THREE.SRGBColorSpace);
    baseMaterial.map = sourceTexture;
    baseMaterial.color.setHex(0xffffff);
    baseMaterial.needsUpdate = true;
    return null;
  }

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
  edgeMaterial.bumpScale = 0.024;
  edgeMaterial.color.setHex(0xc1b8b0);
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

// Backward-compatible helpers retained for any external/manual projector tools.
export function applyPolishedTexture(material, texture, renderer) {
  configureTexture(texture, renderer, THREE.SRGBColorSpace);
  material.map = texture;
  material.color.setHex(0xffffff);
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
  return null;
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
  material.needsUpdate = true;
  return artwork.mask;
}
