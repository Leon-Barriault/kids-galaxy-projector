import * as THREE from 'three';

/**
 * Pi-friendly sculpted-toy surface treatment.
 *
 * The base sphere is a coherent clay body rather than a PNG-wrapped balloon.
 * The child's drawing is converted once, at texture-load time, into a raised
 * colour shell with a darker rounded shoulder and a brighter top surface. This
 * makes broad brush strokes read like molded ribbons/blobs while keeping the
 * child's exact layout and palette identity.
 */

const BASE_CLAY_COLOR = 0xf2ede6;

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
  accentEdgeRadius: 1.068,
  accentRadius: 1.082,
  accentBumpScale: 0.078,
  accentDisplacementScale: 0.056,
  accentEdgeAlphaTest: 0.07,
  accentAlphaTest: 0.22,
  maxAnisotropy: 4,
  clearcoat: 0.04,
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

function stylizedToyRgb(toyHex, presence) {
  const toy = new THREE.Color(toyHex);
  // Antialiased edges become the darker molded side wall. Fully painted areas
  // get a small warm highlight so the colour top reads separately from the base.
  const shoulder = THREE.MathUtils.clamp((0.86 - presence) / 0.7, 0, 1);
  const darken = shoulder * 0.28;
  const brighten = THREE.MathUtils.clamp((presence - 0.68) / 0.32, 0, 1) * 0.055;
  toy.offsetHSL(0, -shoulder * 0.035, brighten - darken);
  return toy;
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
    const useDominantAsBody = coverage > 0.72 && meaningfulColors >= 2 && dominantShare > 0.38;
    const baseColor = useDominantAsBody ? TABLET_PALETTE[dominantIndex].toy : BASE_CLAY_COLOR;

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

      const toy = stylizedToyRgb(TABLET_PALETTE[paletteIndex].toy, presence);
      colourImage.data[index] = Math.round(toy.r * 255);
      colourImage.data[index + 1] = Math.round(toy.g * 255);
      colourImage.data[index + 2] = Math.round(toy.b * 255);
      colourImage.data[index + 3] = 255;
    }

    maskContext.putImageData(maskImage, 0, 0);
    colourContext.putImageData(colourImage, 0, 0);

    return {
      mask: textureFromCanvas(softenedCanvas(maskCanvas, 2.0), THREE.NoColorSpace),
      colour: textureFromCanvas(softenedCanvas(colourCanvas, 0.75), THREE.SRGBColorSpace),
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
    roughness: 0.56,
    metalness: 0.003,
    clearcoat: POLISHED_SURFACE_PROFILE.clearcoat,
    clearcoatRoughness: 0.66,
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
    roughness: 0.46,
    metalness: 0.003,
    clearcoat: 0.08,
    clearcoatRoughness: 0.54,
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
  edgeMaterial.bumpScale = 0.03;
  edgeMaterial.color.setHex(0xb8ada5);
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

// Compatibility hooks used by the current planet entity. The first pass turns
// the sphere into a coherent body colour; the second pass makes the drawing a
// visibly raised sculpted shell. Keeping this split avoids duplicating artwork
// processing in the per-frame renderer and preserves the existing lifecycle.
export function applyPolishedTexture(material, texture, renderer) {
  const artwork = prepareArtwork(texture);
  if (!artwork) {
    configureTexture(texture, renderer, THREE.SRGBColorSpace);
    material.map = texture;
    material.color.setHex(0xffffff);
    material.needsUpdate = true;
    return null;
  }

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
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
  texture.dispose();
  return artwork.mask;
}
