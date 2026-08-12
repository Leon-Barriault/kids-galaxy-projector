import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;
const POLE_REACH = 0.06;
const VERTICAL_ASPECT_THRESHOLD = 1.55;
const SHOULDER_TEXELS = 6;
const DISPLACEMENT_SCALE = 0.06;
const BUMP_SCALE = 0.075;
const BODY_HEIGHT = 36;
const EDGE_SHADE = 0.82;
const RGB_HEX = /^#[0-9a-fA-F]{6}$/;

function rgbOf(value, fallback = '#ffffff') {
  const colour = typeof value === 'string' && RGB_HEX.test(value) ? value : fallback;
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ];
}

function validManifest(manifest) {
  return (
    manifest?.version === 1 &&
    manifest?.coordinate_space === 'normalized-canvas-v1' &&
    RGB_HEX.test(manifest?.background_color || '') &&
    Array.isArray(manifest?.strokes)
  );
}

function normalizedPoints(stroke) {
  if (!Array.isArray(stroke?.points)) return [];
  return stroke.points
    .filter(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
    .map(([x, y]) => [THREE.MathUtils.clamp(x, 0, 1), THREE.MathUtils.clamp(y, 0, 1)]);
}

function strokeProjection(stroke) {
  const points = normalizedPoints(stroke);
  if (points.length < 2) return null;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const spanX = Math.max(0.0001, maxX - minX);
  const spanY = Math.max(0.0001, maxY - minY);
  const nearVertical = spanY / spanX >= VERTICAL_ASPECT_THRESHOLD;

  // The child's horizontal extent is presentation intent, not longitude.
  // Stretch non-vertical strokes to a complete revolution. Tall strokes retain
  // their source X instead, so a top-to-bottom line follows one meridian rather
  // than turning every latitude into a coloured belt.
  const projected = points.map(([x, y]) => [nearVertical ? x : (x - minX) / spanX, y]);
  const widthNormalized = THREE.MathUtils.clamp(
    Number(stroke.width_normalized) || Number(stroke.width_px) / 512 || 0.02,
    0.003,
    0.35,
  );

  return {
    points: projected,
    minY,
    maxY,
    nearVertical,
    widthNormalized,
    colour: rgbOf(stroke.color, '#ffffff'),
  };
}

function drawProjectedStroke(mask, projection) {
  const context = mask.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) return null;
  context.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.strokeStyle = '#ffffff';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(2, projection.widthNormalized * TEXTURE_HEIGHT);

  // Draw three copies. A stretched horizontal stroke deliberately starts and
  // ends at the longitude seam; the copies make that seam continuous. The same
  // treatment also lets a tall stroke whose width overlaps 0/1 wrap naturally.
  for (const shift of [-TEXTURE_WIDTH, 0, TEXTURE_WIDTH]) {
    context.beginPath();
    projection.points.forEach(([x, y], index) => {
      const px = x * TEXTURE_WIDTH + shift;
      const py = y * (TEXTURE_HEIGHT - 1);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    });
    context.stroke();
  }
  return context.getImageData(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT).data;
}

function closePole(owner, colour, colourBuffer, projection, strokeIndex) {
  const widthRows = Math.ceil(projection.widthNormalized * TEXTURE_HEIGHT * 0.7);
  const paintRows = (from, to) => {
    for (let v = Math.max(0, from); v <= Math.min(TEXTURE_HEIGHT - 1, to); v += 1) {
      for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
        const texel = v * TEXTURE_WIDTH + u;
        owner[texel] = strokeIndex;
        colourBuffer[texel * 3] = colour[0];
        colourBuffer[texel * 3 + 1] = colour[1];
        colourBuffer[texel * 3 + 2] = colour[2];
      }
    }
  };

  if (projection.minY <= POLE_REACH) {
    paintRows(0, Math.ceil(projection.minY * TEXTURE_HEIGHT) + widthRows);
  }
  if (projection.maxY >= 1 - POLE_REACH) {
    paintRows(
      Math.floor(projection.maxY * TEXTURE_HEIGHT) - widthRows,
      TEXTURE_HEIGHT - 1,
    );
  }
}

function roundedRelief(owner, levels) {
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const far = TEXTURE_WIDTH + TEXTURE_HEIGHT;
  const distance = new Float32Array(texels);
  for (let i = 0; i < texels; i += 1) distance[i] = owner[i] >= 0 ? far : 0;

  const relax = (v, u, dv, du) => {
    const nv = v + dv;
    if (nv < 0 || nv >= TEXTURE_HEIGHT) return;
    const nu = (u + du + TEXTURE_WIDTH) % TEXTURE_WIDTH;
    const texel = v * TEXTURE_WIDTH + u;
    const candidate = distance[nv * TEXTURE_WIDTH + nu] + (dv && du ? 1.414 : 1);
    if (candidate < distance[texel]) distance[texel] = candidate;
  };

  for (let pass = 0; pass < 2; pass += 1) {
    for (let v = 0; v < TEXTURE_HEIGHT; v += 1) {
      for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
        relax(v, u, -1, 0);
        relax(v, u, -1, -1);
        relax(v, u, -1, 1);
        relax(v, u, 0, -1);
      }
    }
    for (let v = TEXTURE_HEIGHT - 1; v >= 0; v -= 1) {
      for (let u = TEXTURE_WIDTH - 1; u >= 0; u -= 1) {
        relax(v, u, 1, 0);
        relax(v, u, 1, 1);
        relax(v, u, 1, -1);
        relax(v, u, 0, 1);
      }
    }
  }

  const height = new Float32Array(texels);
  const shade = new Float32Array(texels).fill(1);
  for (let i = 0; i < texels; i += 1) {
    const strokeIndex = owner[i];
    if (strokeIndex < 0) continue;
    const t = Math.min(1, distance[i] / SHOULDER_TEXELS);
    const eased = t * t * (3 - 2 * t);
    height[i] = (levels[strokeIndex] || 0.82) * eased;
    shade[i] = EDGE_SHADE + (1 - EDGE_SHADE) * eased;
  }
  return { height, shade };
}

function buildManifestMaps(manifest) {
  const body = rgbOf(manifest.background_color);
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const colour = new Uint8ClampedArray(texels * 3);
  const owner = new Int32Array(texels).fill(-1);
  const levels = [];
  for (let i = 0; i < texels; i += 1) {
    colour[i * 3] = body[0];
    colour[i * 3 + 1] = body[1];
    colour[i * 3 + 2] = body[2];
  }

  const mask = document.createElement('canvas');
  mask.width = TEXTURE_WIDTH;
  mask.height = TEXTURE_HEIGHT;
  let renderedStrokeCount = 0;

  manifest.strokes.forEach((stroke, strokeIndex) => {
    const projection = strokeProjection(stroke);
    if (!projection) return;
    const alpha = drawProjectedStroke(mask, projection);
    if (!alpha) return;

    // Wider kid strokes stand a little prouder, but the range is deliberately
    // narrow so brush choice changes thickness rather than turning paint into
    // slabs. The rounded shoulder supplies most of the perceived embossing.
    levels[strokeIndex] = THREE.MathUtils.clamp(0.72 + projection.widthNormalized * 1.6, 0.74, 1);
    for (let i = 0; i < texels; i += 1) {
      if (alpha[i * 4 + 3] < 32) continue;
      owner[i] = strokeIndex;
      colour[i * 3] = projection.colour[0];
      colour[i * 3 + 1] = projection.colour[1];
      colour[i * 3 + 2] = projection.colour[2];
    }
    closePole(owner, projection.colour, colour, projection, strokeIndex);
    renderedStrokeCount += 1;
  });

  const { height, shade } = roundedRelief(owner, levels);
  const colourCanvas = document.createElement('canvas');
  colourCanvas.width = TEXTURE_WIDTH;
  colourCanvas.height = TEXTURE_HEIGHT;
  const context = colourCanvas.getContext('2d', { alpha: false });
  if (!context) return null;
  const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  for (let i = 0; i < texels; i += 1) {
    image.data[i * 4] = colour[i * 3] * shade[i];
    image.data[i * 4 + 1] = colour[i * 3 + 1] * shade[i];
    image.data[i * 4 + 2] = colour[i * 3 + 2] * shade[i];
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  const scalarCanvas = (writer) => {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    const values = ctx.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
    for (let i = 0; i < texels; i += 1) {
      const value = writer(height[i]);
      values.data[i * 4] = value;
      values.data[i * 4 + 1] = value;
      values.data[i * 4 + 2] = value;
      values.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(values, 0, 0);
    return canvas;
  };

  return {
    colour: colourCanvas,
    height: scalarCanvas((relief) => BODY_HEIGHT + relief * (255 - BODY_HEIGHT)),
    roughness: scalarCanvas((relief) => 242 - relief * 48),
    strokeCount: renderedStrokeCount,
  };
}

function canvasTexture(canvas, { srgb = false } = {}) {
  if (!canvas) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function applyManifestSurface(entity) {
  if (typeof document === 'undefined' || !validManifest(entity?.drawingManifest)) return false;
  const built = buildManifestMaps(entity.drawingManifest);
  if (!built) return false;

  const previous = entity.mesh.material;
  const material = new THREE.MeshPhysicalMaterial({
    map: canvasTexture(built.colour, { srgb: true }),
    roughness: 0.54,
    metalness: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.4,
    envMap: previous?.envMap || null,
    envMapIntensity: previous?.envMapIntensity ?? 0.7,
  });
  material.displacementMap = canvasTexture(built.height);
  material.displacementScale = DISPLACEMENT_SCALE;
  material.displacementBias = -(BODY_HEIGHT / 255) * DISPLACEMENT_SCALE;
  material.bumpMap = material.displacementMap;
  material.bumpScale = BUMP_SCALE;
  material.roughnessMap = canvasTexture(built.roughness);
  material.userData.kidsGalaxyManifestStrokeSurface = true;
  material.userData.kidsGalaxyEmbossedStrokeCount = built.strokeCount;
  material.userData.kidsGalaxyDesignProjectionMode = 'manifest-strokes-embossed-on-body';

  entity.mesh.material = material;
  entity.mesh.userData.kidsGalaxyDrawingManifest = true;
  entity.mesh.userData.kidsGalaxyManifestBackground = entity.drawingManifest.background_color;
  entity.mesh.userData.kidsGalaxyManifestStrokeCount = built.strokeCount;
  return true;
}

export function installManifestStrokeSurface() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyManifestStrokeSurface) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function manifestStrokeTexture(texture) {
    previousApplyTexture.call(this, texture);
    try {
      applyManifestSurface(this);
    } catch (error) {
      console.error('Kids Galaxy manifest stroke surface failed', this.id, error);
      window.kidsGalaxyManifestStrokeFailures = window.kidsGalaxyManifestStrokeFailures || [];
      window.kidsGalaxyManifestStrokeFailures.push({ id: this.id, message: String(error) });
    }
  }

  manifestStrokeTexture.kidsGalaxyManifestStrokeSurface = true;
  PlanetEntity.prototype.applyTexture = manifestStrokeTexture;
}
