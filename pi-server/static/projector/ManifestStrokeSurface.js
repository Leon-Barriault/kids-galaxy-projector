import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const TEXTURE_WIDTH = 512;
const TEXTURE_HEIGHT = 256;
const POLE_CLAIM_THRESHOLD = 0.22;
const VERTICAL_ASPECT_THRESHOLD = 1.55;
const HORIZONTAL_POLE_ASPECT_THRESHOLD = 1.1;
const WRAP_ASPECT_THRESHOLD = 0.72;
const SEAM_BLEND_FRACTION = 0.14;
const DEFAULT_SHOULDER_TEXELS = 8;
const MIN_SHOULDER_TEXELS = 5;
const MAX_SHOULDER_TEXELS = 11;
const SHOULDER_FLOOR = 0.18;
const DISPLACEMENT_SCALE = 0.145;
const BUMP_SCALE = 0.22;
const BODY_HEIGHT = 26;
const EDGE_SHADE = 0.7;
const MIN_LAYER_LEVEL = 0.42;
const MAX_LAYER_LEVEL = 1.0;
const ORDER_WEIGHT = 0.35;
const WIDTH_WEIGHT = 0.25;
const COVERAGE_WEIGHT = 0.2;
const POLE_WEIGHT = 0.1;
const JITTER_WEIGHT = 0.1;
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

function stableStrokeId(stroke, strokeIndex) {
  const value = typeof stroke?.stroke_id === 'string' ? stroke.stroke_id.trim() : '';
  return value || `stroke-${String(strokeIndex).padStart(4, '0')}`;
}

function stableUnitHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0xffffffff;
}

function smoothstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function makePeriodic(points) {
  if (points.length < 2) return points;
  const seamY = (points[0][1] + points[points.length - 1][1]) * 0.5;
  const adjusted = points.map(([x, y]) => {
    const seamDistance = Math.min(x, 1 - x);
    const seamWeight = 1 - smoothstep(seamDistance / SEAM_BLEND_FRACTION);
    return [x, THREE.MathUtils.lerp(y, seamY, seamWeight)];
  });
  adjusted[0] = [0, seamY];
  adjusted[adjusted.length - 1] = [1, seamY];
  return adjusted;
}

function strokeProjection(stroke, strokeIndex) {
  const points = normalizedPoints(stroke);
  if (points.length < 2) return null;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let sumY = 0;
  let pathLength = 0;
  points.forEach(([x, y], index) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumY += y;
    if (index > 0) {
      pathLength += Math.hypot(x - points[index - 1][0], y - points[index - 1][1]);
    }
  });

  const spanX = Math.max(0.0001, maxX - minX);
  const spanY = Math.max(0.0001, maxY - minY);
  const verticalAspect = spanY / spanX;
  const horizontalAspect = spanX / spanY;
  const nearVertical = verticalAspect >= VERTICAL_ASPECT_THRESHOLD;
  const wrapsLongitude = !nearVertical && horizontalAspect >= WRAP_ASPECT_THRESHOLD;
  const horizontalPoleCandidate =
    !nearVertical && horizontalAspect >= HORIZONTAL_POLE_ASPECT_THRESHOLD;
  const projected = wrapsLongitude
    ? makePeriodic(points.map(([x, y]) => [(x - minX) / spanX, y]))
    : points;

  const widthNormalized = THREE.MathUtils.clamp(
    Number(stroke.width_normalized) || Number(stroke.width_px) / 512 || 0.02,
    0.003,
    0.35,
  );
  const halfWidth = widthNormalized * 0.5;
  const colourHex = RGB_HEX.test(stroke?.color || '') ? stroke.color.toLowerCase() : '#ffffff';
  const order = Number.isFinite(Number(stroke?.order)) ? Number(stroke.order) : strokeIndex;
  const coverageMetric = THREE.MathUtils.clamp(
    spanX * 0.55 + spanY * 0.25 + Math.min(1, pathLength) * 0.2,
    0,
    1,
  );

  return {
    strokeIndex,
    strokeId: stableStrokeId(stroke, strokeIndex),
    order,
    points: projected,
    minY,
    maxY,
    centerY: sumY / points.length,
    bandFrom: THREE.MathUtils.clamp(minY - halfWidth, 0, 1),
    bandTo: THREE.MathUtils.clamp(maxY + halfWidth, 0, 1),
    horizontalPoleCandidate,
    widthNormalized,
    coverageMetric,
    colourHex,
    colour: rgbOf(colourHex, '#ffffff'),
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

function paintRows(owner, colour, projection, from, to) {
  const start = Math.max(0, Math.floor(from));
  const end = Math.min(TEXTURE_HEIGHT - 1, Math.ceil(to));
  for (let v = start; v <= end; v += 1) {
    for (let u = 0; u < TEXTURE_WIDTH; u += 1) {
      const texel = v * TEXTURE_WIDTH + u;
      owner[texel] = projection.strokeIndex;
      colour[texel * 3] = projection.colour[0];
      colour[texel * 3 + 1] = projection.colour[1];
      colour[texel * 3 + 2] = projection.colour[2];
    }
  }
}

function choosePoleOwners(projections) {
  const candidates = projections.filter((projection) => projection.horizontalPoleCandidate);
  const north = candidates
    .filter((projection) => projection.bandFrom <= POLE_CLAIM_THRESHOLD)
    .sort((a, b) => a.bandFrom - b.bandFrom || a.centerY - b.centerY)[0];
  const south = candidates
    .filter((projection) => projection.bandTo >= 1 - POLE_CLAIM_THRESHOLD)
    .sort((a, b) => b.bandTo - a.bandTo || b.centerY - a.centerY)[0];
  return { north: north?.strokeIndex ?? -1, south: south?.strokeIndex ?? -1 };
}

function closePole(owner, colour, projection, poleOwners) {
  if (projection.strokeIndex === poleOwners.north) {
    paintRows(owner, colour, projection, 0, projection.bandTo * (TEXTURE_HEIGHT - 1));
  }
  if (projection.strokeIndex === poleOwners.south) {
    paintRows(
      owner,
      colour,
      projection,
      projection.bandFrom * (TEXTURE_HEIGHT - 1),
      TEXTURE_HEIGHT - 1,
    );
  }
}

function normalizedMetricScores(projections, selector) {
  const scores = [];
  if (!projections.length) return scores;
  const values = projections.map(selector);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  projections.forEach((projection, index) => {
    scores[projection.strokeIndex] =
      maximum - minimum < 1e-6 ? 0.5 : (values[index] - minimum) / (maximum - minimum);
  });
  return scores;
}

function strokeProfiles(projections, poleOwners) {
  const orderScores = normalizedMetricScores(projections, (projection) => projection.order);
  const widthScores = normalizedMetricScores(projections, (projection) => projection.widthNormalized);
  const coverageScores = normalizedMetricScores(projections, (projection) => projection.coverageMetric);
  return projections.map((projection) => {
    const order = orderScores[projection.strokeIndex] ?? 0.5;
    const width = widthScores[projection.strokeIndex] ?? 0.5;
    const coverage = coverageScores[projection.strokeIndex] ?? 0.5;
    let pole = 0;
    if (projection.strokeIndex === poleOwners.north || projection.strokeIndex === poleOwners.south) {
      pole = 1;
    } else if (
      projection.horizontalPoleCandidate &&
      (projection.bandFrom <= POLE_CLAIM_THRESHOLD * 1.35 ||
        projection.bandTo >= 1 - POLE_CLAIM_THRESHOLD * 1.35)
    ) {
      pole = 0.5;
    }
    const jitter = stableUnitHash(projection.strokeId);
    const score = THREE.MathUtils.clamp(
      ORDER_WEIGHT * order +
        WIDTH_WEIGHT * width +
        COVERAGE_WEIGHT * coverage +
        POLE_WEIGHT * pole +
        JITTER_WEIGHT * jitter,
      0,
      1,
    );
    const shoulderScore = THREE.MathUtils.clamp(width * 0.65 + coverage * 0.25 + jitter * 0.1, 0, 1);
    return {
      strokeIndex: projection.strokeIndex,
      strokeId: projection.strokeId,
      colour: projection.colourHex,
      level: THREE.MathUtils.lerp(MIN_LAYER_LEVEL, MAX_LAYER_LEVEL, score),
      shoulderTexels: THREE.MathUtils.lerp(MIN_SHOULDER_TEXELS, MAX_SHOULDER_TEXELS, shoulderScore),
      score,
      components: { order, width, coverage, pole, jitter },
    };
  });
}

function roundedRelief(owner, profiles) {
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const far = TEXTURE_WIDTH + TEXTURE_HEIGHT;
  const distance = new Float32Array(texels);
  const profileByStroke = [];
  profiles.forEach((profile) => {
    profileByStroke[profile.strokeIndex] = profile;
  });
  const ownerAt = (v, u) => {
    if (v < 0 || v >= TEXTURE_HEIGHT) return null;
    return owner[v * TEXTURE_WIDTH + ((u + TEXTURE_WIDTH) % TEXTURE_WIDTH)];
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
      distance[texel] = neighbours.some((neighbour) => neighbour !== null && neighbour !== strokeIndex)
        ? 1
        : far;
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
  for (let index = 0; index < texels; index += 1) {
    const strokeIndex = owner[index];
    if (strokeIndex < 0) continue;
    const profile = profileByStroke[strokeIndex];
    const t = Math.min(1, distance[index] / (profile?.shoulderTexels || DEFAULT_SHOULDER_TEXELS));
    const eased = smoothstep(t);
    const rounded = SHOULDER_FLOOR + (1 - SHOULDER_FLOOR) * eased;
    height[index] = (profile?.level || 0.75) * rounded;
    shade[index] = EDGE_SHADE + (1 - EDGE_SHADE) * eased;
  }
  return { height, shade };
}

function scalarCanvas(height, writer) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  const values = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  for (let index = 0; index < height.length; index += 1) {
    const value = writer(height[index]);
    values.data[index * 4] = value;
    values.data[index * 4 + 1] = value;
    values.data[index * 4 + 2] = value;
    values.data[index * 4 + 3] = 255;
  }
  context.putImageData(values, 0, 0);
  return canvas;
}

function buildManifestMaps(manifest) {
  const body = rgbOf(manifest.background_color);
  const texels = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const colour = new Uint8ClampedArray(texels * 3);
  const owner = new Int32Array(texels).fill(-1);
  for (let index = 0; index < texels; index += 1) {
    colour[index * 3] = body[0];
    colour[index * 3 + 1] = body[1];
    colour[index * 3 + 2] = body[2];
  }

  const projections = manifest.strokes
    .map((stroke, strokeIndex) => strokeProjection(stroke, strokeIndex))
    .filter(Boolean);
  const poleOwners = choosePoleOwners(projections);
  const profiles = strokeProfiles(projections, poleOwners);
  const mask = document.createElement('canvas');
  mask.width = TEXTURE_WIDTH;
  mask.height = TEXTURE_HEIGHT;
  let renderedStrokeCount = 0;

  projections.forEach((projection) => {
    const alpha = drawProjectedStroke(mask, projection);
    if (!alpha) return;
    for (let index = 0; index < texels; index += 1) {
      if (alpha[index * 4 + 3] < 32) continue;
      owner[index] = projection.strokeIndex;
      colour[index * 3] = projection.colour[0];
      colour[index * 3 + 1] = projection.colour[1];
      colour[index * 3 + 2] = projection.colour[2];
    }
    closePole(owner, colour, projection, poleOwners);
    renderedStrokeCount += 1;
  });

  const { height, shade } = roundedRelief(owner, profiles);
  const colourCanvas = document.createElement('canvas');
  colourCanvas.width = TEXTURE_WIDTH;
  colourCanvas.height = TEXTURE_HEIGHT;
  const context = colourCanvas.getContext('2d', { alpha: false });
  if (!context) return null;
  const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  for (let index = 0; index < texels; index += 1) {
    image.data[index * 4] = colour[index * 3] * shade[index];
    image.data[index * 4 + 1] = colour[index * 3 + 1] * shade[index];
    image.data[index * 4 + 2] = colour[index * 3 + 2] * shade[index];
    image.data[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  const diagnostics = profiles.map((profile) => ({
    strokeId: profile.strokeId,
    strokeIndex: profile.strokeIndex,
    colour: profile.colour,
    level: profile.level,
    score: profile.score,
    shoulderTexels: profile.shoulderTexels,
    components: { ...profile.components },
  }));
  return {
    colour: colourCanvas,
    height: scalarCanvas(height, (relief) => BODY_HEIGHT + relief * (255 - BODY_HEIGHT)),
    roughness: scalarCanvas(height, (relief) => 238 - relief * 72),
    strokeCount: renderedStrokeCount,
    layerLevels: diagnostics.map((profile) => profile.level),
    strokeProfiles: diagnostics,
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
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.46,
    clearcoatRoughness: 0.3,
    envMap: previous?.envMap || null,
    envMapIntensity: previous?.envMapIntensity ?? 0.78,
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
  material.userData.kidsGalaxyEmbossStrokeProfiles = built.strokeProfiles;
  material.userData.kidsGalaxyEmbossHeightHeuristic = 'order35-width25-coverage20-pole10-jitter10';
  material.userData.kidsGalaxyNorthPoleStroke = built.northPoleStroke;
  material.userData.kidsGalaxySouthPoleStroke = built.southPoleStroke;
  // Keep the stable contract name used by the shared projector smoke suite. The
  // implementation is now periodic/wavy rather than row-filled, but it is still
  // the same manifest-strokes-on-body rendering stage.
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
