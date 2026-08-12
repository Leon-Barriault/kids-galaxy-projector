import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;
const POLE_CLAIM_THRESHOLD = 0.22;
const VERTICAL_ASPECT_THRESHOLD = 1.55;
const HORIZONTAL_BAND_ASPECT_THRESHOLD = 2.25;
const HORIZONTAL_POLE_ASPECT_THRESHOLD = 1.1;
const SHOULDER_TEXELS = 9;
const SHOULDER_FLOOR = 0.28;
const DISPLACEMENT_SCALE = 0.11;
const BUMP_SCALE = 0.16;
const BODY_HEIGHT = 36;
const EDGE_SHADE = 0.76;
const MIN_LAYER_LEVEL = 0.6;
const MAX_LAYER_LEVEL = 0.98;
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

function strokeProjection(stroke, strokeIndex) {
  const points = normalizedPoints(stroke);
  if (points.length < 2) return null;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let sumY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumY += y;
  }

  const spanX = Math.max(0.0001, maxX - minX);
  const spanY = Math.max(0.0001, maxY - minY);
  const verticalAspect = spanY / spanX;
  const horizontalAspect = spanX / spanY;
  const nearVertical = verticalAspect >= VERTICAL_ASPECT_THRESHOLD;
  const horizontalBand = !nearVertical && horizontalAspect >= HORIZONTAL_BAND_ASPECT_THRESHOLD;
  const horizontalPoleCandidate =
    !nearVertical && horizontalAspect >= HORIZONTAL_POLE_ASPECT_THRESHOLD;

  // The child's horizontal extent is presentation intent, not longitude. Any
  // non-vertical path is expanded over a complete revolution. Strongly
  // horizontal paths become latitude layers instead of a single wavy centreline;
  // this is what makes a broad painted stripe read as a continuous toy-like band.
  const projected = points.map(([x, y]) => [nearVertical ? x : (x - minX) / spanX, y]);
  const widthNormalized = THREE.MathUtils.clamp(
    Number(stroke.width_normalized) || Number(stroke.width_px) / 512 || 0.02,
    0.003,
    0.35,
  );
  const halfWidth = widthNormalized * 0.5;

  return {
    strokeIndex,
    points: projected,
    minY,
    maxY,
    centerY: sumY / points.length,
    bandFrom: THREE.MathUtils.clamp(minY - halfWidth, 0, 1),
    bandTo: THREE.MathUtils.clamp(maxY + halfWidth, 0, 1),
    nearVertical,
    horizontalBand,
    horizontalPoleCandidate,
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

  // Three copies make the longitude seam continuous for both wrapped diagonal
  // strokes and meridian strokes whose brush width overlaps 0/1.
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

function paintRows(owner, colourBuffer, colour, strokeIndex, from, to) {
  const start = Math.max(0, Math.floor(from));
  const end = Math.min(TEXTURE_HEIGHT - 1, Math.ceil(to));
  for (let v = start; v <= end; v += 1) {
    for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
      const texel = v * TEXTURE_WIDTH + u;
      owner[texel] = strokeIndex;
      colourBuffer[texel * 3] = colour[0];
      colourBuffer[texel * 3 + 1] = colour[1];
      colourBuffer[texel * 3 + 2] = colour[2];
    }
  }
}

function paintHorizontalBand(owner, colourBuffer, projection) {
  paintRows(
    owner,
    colourBuffer,
    projection.colour,
    projection.strokeIndex,
    projection.bandFrom * (TEXTURE_HEIGHT - 1),
    projection.bandTo * (TEXTURE_HEIGHT - 1),
  );
}

function choosePoleOwners(projections) {
  const candidates = projections.filter((projection) => projection.horizontalPoleCandidate);
  const north = candidates
    .filter((projection) => projection.bandFrom <= POLE_CLAIM_THRESHOLD)
    .sort((a, b) => a.bandFrom - b.bandFrom || a.centerY - b.centerY)[0];
  const south = candidates
    .filter((projection) => projection.bandTo >= 1 - POLE_CLAIM_THRESHOLD)
    .sort((a, b) => b.bandTo - a.bandTo || b.centerY - a.centerY)[0];
  return {
    north: north?.strokeIndex ?? -1,
    south: south?.strokeIndex ?? -1,
  };
}

function closePole(owner, colourBuffer, projection, poleOwners) {
  if (projection.strokeIndex === poleOwners.north) {
    paintRows(
      owner,
      colourBuffer,
      projection.colour,
      projection.strokeIndex,
      0,
      projection.bandTo * (TEXTURE_HEIGHT - 1),
    );
  }
  if (projection.strokeIndex === poleOwners.south) {
    paintRows(
      owner,
      colourBuffer,
      projection.colour,
      projection.strokeIndex,
      projection.bandFrom * (TEXTURE_HEIGHT - 1),
      TEXTURE_HEIGHT - 1,
    );
  }
}

function layerLevels(projections) {
  const levels = [];
  const ranked = [...projections].sort(
    (a, b) => a.centerY - b.centerY || a.strokeIndex - b.strokeIndex,
  );
  ranked.forEach((projection, rank) => {
    const t = ranked.length <= 1 ? 0 : rank / (ranked.length - 1);
    // North-to-south terraces deliberately sit at different heights. This makes
    // neighbouring painted layers read as separate pieces of soft moulded clay
    // even when their colours touch with no background gap between them.
    levels[projection.strokeIndex] = THREE.MathUtils.lerp(MAX_LAYER_LEVEL, MIN_LAYER_LEVEL, t);
  });
  return levels;
}

function roundedRelief(owner, levels) {
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const far = TEXTURE_WIDTH + TEXTURE_HEIGHT;
  const distance = new Float32Array(texels);

  const ownerAt = (v, u) => {
    if (v < 0 || v >= TEXTURE_HEIGHT) return null;
    const wrappedU = (u + TEXTURE_WIDTH) % TEXTURE_WIDTH;
    return owner[v * TEXTURE_WIDTH + wrappedU];
  };

  for (let v = 0; v < TEXTURE_HEIGHT; v += 1) {
    for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
      const texel = v * TEXTURE_WIDTH + u;
      const strokeIndex = owner[texel];
      if (strokeIndex < 0) {
        distance[texel] = 0;
        continue;
      }
      const neighbours = [ownerAt(v - 1, u), ownerAt(v + 1, u), ownerAt(v, u - 1), ownerAt(v, u + 1)];
      const boundary = neighbours.some(
        (neighbour) => neighbour !== null && neighbour !== strokeIndex,
      );
      distance[texel] = boundary ? 1 : far;
    }
  }

  const relax = (v, u, dv, du) => {
    const nv = v + dv;
    if (nv < 0 || nv >= TEXTURE_HEIGHT) return;
    const nu = (u + du + TEXTURE_WIDTH) % TEXTURE_WIDTH;
    const texel = v * TEXTURE_WIDTH + u;
    const neighbour = nv * TEXTURE_WIDTH + nu;
    if (owner[texel] < 0 || owner[neighbour] !== owner[texel]) return;
    const candidate = distance[neighbour] + (dv && du ? 1.414 : 1);
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
    const rounded = SHOULDER_FLOOR + (1 - SHOULDER_FLOOR) * eased;
    height[i] = (levels[strokeIndex] || 0.8) * rounded;
    shade[i] = EDGE_SHADE + (1 - EDGE_SHADE) * eased;
  }
  return { height, shade };
}

function buildManifestMaps(manifest) {
  const body = rgbOf(manifest.background_color);
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const colour = new Uint8ClampedArray(texels * 3);
  const owner = new Int32Array(texels).fill(-1);
  for (let i = 0; i < texels; i += 1) {
    colour[i * 3] = body[0];
    colour[i * 3 + 1] = body[1];
    colour[i * 3 + 2] = body[2];
  }

  const projections = manifest.strokes
    .map((stroke, strokeIndex) => strokeProjection(stroke, strokeIndex))
    .filter(Boolean);
  const levels = layerLevels(projections);
  const poleOwners = choosePoleOwners(projections);

  const mask = document.createElement('canvas');
  mask.width = TEXTURE_WIDTH;
  mask.height = TEXTURE_HEIGHT;
  let renderedStrokeCount = 0;

  projections.forEach((projection) => {
    if (projection.horizontalBand) {
      paintHorizontalBand(owner, colour, projection);
    } else {
      const alpha = drawProjectedStroke(mask, projection);
      if (!alpha) return;
      for (let i = 0; i < texels; i += 1) {
        if (alpha[i * 4 + 3] < 32) continue;
        owner[i] = projection.strokeIndex;
        colour[i * 3] = projection.colour[0];
        colour[i * 3 + 1] = projection.colour[1];
        colour[i * 3 + 2] = projection.colour[2];
      }
    }
    closePole(owner, colour, projection, poleOwners);
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
    roughness: scalarCanvas((relief) => 244 - relief * 58),
    strokeCount: renderedStrokeCount,
    layerLevels: levels.filter((level) => Number.isFinite(level)),
    northPoleStroke: poleOwners.north,
    southPoleStroke: poleOwners.south,
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
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.56,
    clearcoatRoughness: 0.34,
    envMap: previous?.envMap || null,
    envMapIntensity: previous?.envMapIntensity ?? 0.72,
  });
  material.displacementMap = canvasTexture(built.height);
  material.displacementScale = DISPLACEMENT_SCALE;
  material.displacementBias = -(BODY_HEIGHT / 255) * DISPLACEMENT_SCALE;
  material.bumpMap = material.displacementMap;
  material.bumpScale = BUMP_SCALE;
  material.roughnessMap = canvasTexture(built.roughness);
  material.userData.kidsGalaxyManifestStrokeSurface = true;
  material.userData.kidsGalaxyEmbossedStrokeCount = built.strokeCount;
  material.userData.kidsGalaxyEmbossLayerLevels = built.layerLevels;
  material.userData.kidsGalaxyNorthPoleStroke = built.northPoleStroke;
  material.userData.kidsGalaxySouthPoleStroke = built.southPoleStroke;
  material.userData.kidsGalaxyDesignProjectionMode = 'manifest-strokes-layered-on-body';

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
