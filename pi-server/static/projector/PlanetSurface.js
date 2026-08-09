import * as THREE from 'three';

/**
 * Pi-friendly molded-toy surface treatment.
 *
 * The child's colour texture remains untouched. A tiny grayscale relief map is
 * derived once when the texture loads. Unpainted white stays at the sphere's
 * original radius while painted regions rise by a uniform amount with softly
 * rounded edges. A second tiny paint mask drives a very thin accent shell so
 * the child's strokes read like molded ribbons/blobs sitting on the planet,
 * closer to a sculpted toy than an inflated balloon.
 */

export const POLISHED_SURFACE_PROFILE = Object.freeze({
  reliefWidth: 256,
  reliefHeight: 128,
  baseRelief: 0.5,
  accentRelief: 0.94,
  bumpScale: 0.055,
  displacementScale: 0.025,
  displacementBias: -0.0125,
  accentRadius: 1.078,
  accentBumpScale: 0.045,
  maxAnisotropy: 4,
  clearcoat: 0.05,
});

function paintPresence(r, g, b) {
  // The tablet texture has a white unpainted base. Measure distance from white
  // instead of assigning a different height to every palette colour. The
  // gradual threshold preserves antialiased brush edges and becomes the bevel.
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  const distance = Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
  return THREE.MathUtils.smoothstep(distance, 0.045, 0.22);
}

function moldedHeight(r, g, b) {
  const presence = paintPresence(r, g, b);
  return THREE.MathUtils.lerp(
    POLISHED_SURFACE_PROFILE.baseRelief,
    POLISHED_SURFACE_PROFILE.accentRelief,
    presence,
  );
}

function softenedCanvas(source, blur = 2.6) {
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

  // Older kiosk Chromium fallback: repeated down/up sampling softens edges.
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

function textureFromCanvas(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
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
        moldedHeight(pixels[index], pixels[index + 1], pixels[index + 2]) * 255,
      );
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return textureFromCanvas(softenedCanvas(canvas, 2.6));
  } catch (_error) {
    return null;
  }
}

export function createPaintMask(texture) {
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
        paintPresence(pixels[index], pixels[index + 1], pixels[index + 2]) * 255,
      );
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return textureFromCanvas(softenedCanvas(canvas, 2.2));
  } catch (_error) {
    return null;
  }
}

export function createPolishedPlanetMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.63,
    metalness: 0.004,
    clearcoat: POLISHED_SURFACE_PROFILE.clearcoat,
    clearcoatRoughness: 0.68,
  });
}

export function createMoldedAccentMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.52,
    metalness: 0.004,
    clearcoat: 0.09,
    clearcoatRoughness: 0.58,
    alphaTest: 0.06,
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

function configureTexture(texture, renderer) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(
    POLISHED_SURFACE_PROFILE.maxAnisotropy,
    renderer.capabilities.getMaxAnisotropy(),
  );
}

export function applyPolishedTexture(material, texture, renderer) {
  configureTexture(texture, renderer);

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

export function applyMoldedAccentTexture(material, texture, renderer) {
  configureTexture(texture, renderer);
  const mask = createPaintMask(texture);
  if (!mask) return null;

  material.map = texture;
  material.alphaMap = mask;
  material.bumpMap = mask;
  material.bumpScale = POLISHED_SURFACE_PROFILE.accentBumpScale;
  material.color.setHex(0xffffff);
  material.needsUpdate = true;
  return mask;
}
