import * as THREE from 'three';

/**
 * Pi-friendly molded-toy surface treatment.
 *
 * The colour texture remains the child's artwork. A tiny relief texture is
 * derived once from the tablet palette so neighbouring colour regions catch
 * light at slightly different heights, like molded clay/plastic. The same
 * small map drives both bump lighting and a very shallow vertex displacement;
 * there is no per-frame CPU image work and no generated high-poly mesh.
 */

export const POLISHED_SURFACE_PROFILE = Object.freeze({
  reliefWidth: 256,
  reliefHeight: 128,
  bumpScale: 0.055,
  displacementScale: 0.065,
  displacementBias: -0.0325,
  maxAnisotropy: 4,
  clearcoat: 0.32,
});

const TABLET_PALETTE = [
  { rgb: [0xe5, 0x39, 0x35], height: 0.68 }, // red
  { rgb: [0xff, 0x98, 0x00], height: 0.76 }, // orange
  { rgb: [0xff, 0xeb, 0x3b], height: 0.84 }, // yellow
  { rgb: [0x4c, 0xaf, 0x50], height: 0.64 }, // green
  { rgb: [0x21, 0x96, 0xf3], height: 0.54 }, // blue
  { rgb: [0x9c, 0x27, 0xb0], height: 0.72 }, // purple
  { rgb: [0xe9, 0x1e, 0x63], height: 0.70 }, // pink
  { rgb: [0x00, 0x00, 0x00], height: 0.38 }, // black
];

function nearestPaletteHeight(r, g, b) {
  let bestDistance = Number.POSITIVE_INFINITY;
  let height = 0.58;
  for (const swatch of TABLET_PALETTE) {
    const dr = r - swatch.rgb[0];
    const dg = g - swatch.rgb[1];
    const db = b - swatch.rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      height = swatch.height;
    }
  }
  return height;
}

function softenedCanvas(source) {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;

  context.imageSmoothingEnabled = true;
  if ('filter' in context) {
    context.filter = 'blur(1.4px)';
    context.drawImage(source, 0, 0);
    context.filter = 'none';
    return output;
  }

  // Older kiosk Chromium fallback: a down/up sample rounds hard region edges.
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

export function createPaletteReliefMap(texture) {
  if (typeof document === 'undefined' || !texture?.image) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = POLISHED_SURFACE_PROFILE.reliefWidth;
    canvas.height = POLISHED_SURFACE_PROFILE.reliefHeight;
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!context) return null;

    context.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const value = Math.round(
        nearestPaletteHeight(pixels[index], pixels[index + 1], pixels[index + 2]) * 255,
      );
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);

    const relief = new THREE.CanvasTexture(softenedCanvas(canvas));
    relief.colorSpace = THREE.NoColorSpace;
    relief.generateMipmaps = false;
    relief.minFilter = THREE.LinearFilter;
    relief.magFilter = THREE.LinearFilter;
    relief.wrapS = THREE.RepeatWrapping;
    relief.wrapT = THREE.ClampToEdgeWrapping;
    relief.needsUpdate = true;
    return relief;
  } catch (_error) {
    // Visual enhancement only. The original texture must always remain usable.
    return null;
  }
}

export function createPolishedPlanetMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.015,
    clearcoat: POLISHED_SURFACE_PROFILE.clearcoat,
    clearcoatRoughness: 0.3,
  });
}

export function createPolishedFeatureMaterial(
  color,
  {
    roughness = 0.38,
    clearcoat = 0.36,
    metalness = 0.01,
    side = THREE.FrontSide,
  } = {},
) {
  const resolvedColor = color?.isColor ? color.clone() : new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: resolvedColor,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness: Math.min(0.6, roughness + 0.04),
    side,
  });
}

export function applyPolishedTexture(material, texture, renderer) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(
    POLISHED_SURFACE_PROFILE.maxAnisotropy,
    renderer.capabilities.getMaxAnisotropy(),
  );

  const relief = createPaletteReliefMap(texture);
  material.map = texture;
  material.bumpMap = relief;
  material.bumpScale = relief ? POLISHED_SURFACE_PROFILE.bumpScale : 0;
  material.displacementMap = relief;
  material.displacementScale = relief ? POLISHED_SURFACE_PROFILE.displacementScale : 0;
  material.displacementBias = relief ? POLISHED_SURFACE_PROFILE.displacementBias : 0;
  material.color.setHex(0xffffff);
  material.emissive.setHex(0x000000);
  material.emissiveMap = null;
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
  return relief;
}
