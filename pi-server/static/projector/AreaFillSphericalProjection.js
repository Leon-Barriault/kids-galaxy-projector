import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const SAMPLE_GRID = 96;
const BODY_MATCH_DISTANCE = 54;
const AREA_FILL_MIN_COVERAGE = 0.38;
const AREA_FILL_ROW_COVERAGE = 0.72;
const AREA_FILL_MIN_BROAD_ROWS = 0.3;
const BODY_RADIUS = 1.05;
const PAINT_RELIEF = 0.012;
const STROKE_WRAP_DEGREES = 480;
const HALF_WRAP_RADIANS = THREE.MathUtils.degToRad(STROKE_WRAP_DEGREES / 2);
const LATITUDE_DEGREES = 180;
const HALF_LATITUDE_RADIANS = Math.PI / 2;
const EXTRA_WRAP_TAPER = 0.68;
const FIRST_REVOLUTION_LIMIT = Math.PI;

function hasExplicitBodyColor(entity) {
  return typeof entity?.bodyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(entity.bodyColor);
}

function parseHexColour(value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value || '')) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function rgbDistance(r, g, b, target) {
  const dr = r - target[0];
  const dg = g - target[1];
  const db = b - target[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function makeSample(texture, bodyRgb) {
  if (typeof document === 'undefined' || !texture?.image) return null;
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_GRID;
  canvas.height = SAMPLE_GRID;
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;

  context.fillStyle = `rgb(${bodyRgb[0]}, ${bodyRgb[1]}, ${bodyRgb[2]})`;
  context.fillRect(0, 0, SAMPLE_GRID, SAMPLE_GRID);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(texture.image, 0, 0, SAMPLE_GRID, SAMPLE_GRID);
  return context.getImageData(0, 0, SAMPLE_GRID, SAMPLE_GRID).data;
}

function analyseAreaFill(pixels, bodyRgb) {
  let authored = 0;
  let broadRows = 0;
  const authoredMask = new Uint8Array(SAMPLE_GRID * SAMPLE_GRID);

  for (let y = 0; y < SAMPLE_GRID; y += 1) {
    let rowAuthored = 0;
    for (let x = 0; x < SAMPLE_GRID; x += 1) {
      const pixel = (y * SAMPLE_GRID + x) * 4;
      const isAuthored = rgbDistance(
        pixels[pixel],
        pixels[pixel + 1],
        pixels[pixel + 2],
        bodyRgb,
      ) > BODY_MATCH_DISTANCE;
      if (!isAuthored) continue;
      authoredMask[y * SAMPLE_GRID + x] = 1;
      authored += 1;
      rowAuthored += 1;
    }
    if (rowAuthored / SAMPLE_GRID >= AREA_FILL_ROW_COVERAGE) broadRows += 1;
  }

  const coverage = authored / (SAMPLE_GRID * SAMPLE_GRID);
  const broadRowFraction = broadRows / SAMPLE_GRID;
  return {
    authoredMask,
    coverage,
    broadRows,
    broadRowFraction,
    useAreaFill:
      coverage >= AREA_FILL_MIN_COVERAGE &&
      broadRowFraction >= AREA_FILL_MIN_BROAD_ROWS,
  };
}

function postRevolutionTaper(longitude) {
  const overflow = Math.max(0, Math.abs(longitude) - FIRST_REVOLUTION_LIMIT);
  const available = Math.max(0.000001, HALF_WRAP_RADIANS - FIRST_REVOLUTION_LIMIT);
  const amount = THREE.MathUtils.clamp(overflow / available, 0, 1);
  return THREE.MathUtils.lerp(1, EXTRA_WRAP_TAPER, amount);
}

function sphericalPoint(u, v, radius) {
  const authoredX = THREE.MathUtils.clamp(u * 2 - 1, -1, 1);
  const authoredY = THREE.MathUtils.clamp(1 - v * 2, -1, 1);
  const longitude = authoredX * HALF_WRAP_RADIANS;
  const latitude = authoredY * HALF_LATITUDE_RADIANS;
  const horizontalRadius = Math.cos(latitude);
  const taperedRadius = BODY_RADIUS + (radius - BODY_RADIUS) * postRevolutionTaper(longitude);
  return {
    point: new THREE.Vector3(
      Math.sin(longitude) * horizontalRadius,
      Math.sin(latitude),
      Math.cos(longitude) * horizontalRadius,
    ).multiplyScalar(taperedRadius),
    latitude,
    longitude,
  };
}

function pushVertex(positions, colours, normals, uvs, u, v, radius, colour) {
  const { point, latitude, longitude } = sphericalPoint(u, v, radius);
  const normal = point.clone().normalize();
  positions.push(point.x, point.y, point.z);
  colours.push(colour.r, colour.g, colour.b);
  normals.push(normal.x, normal.y, normal.z);
  uvs.push(u, v);
  return { latitude, longitude };
}

function createAreaFillGeometry(pixels, analysis) {
  const positions = [];
  const colours = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const colour = new THREE.Color();
  let minimumLatitude = Number.POSITIVE_INFINITY;
  let maximumLatitude = Number.NEGATIVE_INFINITY;
  let minimumLongitude = Number.POSITIVE_INFINITY;
  let maximumLongitude = Number.NEGATIVE_INFINITY;
  let quadCount = 0;

  for (let y = 0; y < SAMPLE_GRID; y += 1) {
    for (let x = 0; x < SAMPLE_GRID; x += 1) {
      if (!analysis.authoredMask[y * SAMPLE_GRID + x]) continue;
      const pixel = (y * SAMPLE_GRID + x) * 4;
      colour.setRGB(
        pixels[pixel] / 255,
        pixels[pixel + 1] / 255,
        pixels[pixel + 2] / 255,
        THREE.SRGBColorSpace,
      );

      const u0 = x / SAMPLE_GRID;
      const u1 = (x + 1) / SAMPLE_GRID;
      const v0 = y / SAMPLE_GRID;
      const v1 = (y + 1) / SAMPLE_GRID;
      const base = positions.length / 3;
      const corners = [
        pushVertex(positions, colours, normals, uvs, u0, v0, BODY_RADIUS + PAINT_RELIEF, colour),
        pushVertex(positions, colours, normals, uvs, u1, v0, BODY_RADIUS + PAINT_RELIEF, colour),
        pushVertex(positions, colours, normals, uvs, u1, v1, BODY_RADIUS + PAINT_RELIEF, colour),
        pushVertex(positions, colours, normals, uvs, u0, v1, BODY_RADIUS + PAINT_RELIEF, colour),
      ];
      corners.forEach(({ latitude, longitude }) => {
        minimumLatitude = Math.min(minimumLatitude, latitude);
        maximumLatitude = Math.max(maximumLatitude, latitude);
        minimumLongitude = Math.min(minimumLongitude, longitude);
        maximumLongitude = Math.max(maximumLongitude, longitude);
      });
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      quadCount += 1;
    }
  }

  if (!quadCount) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxySculptedKidPatch = true;
  geometry.userData.kidsGalaxySourceCanvasAreaFill = true;
  geometry.userData.kidsGalaxyAngularStrokeWrap = true;
  geometry.userData.kidsGalaxyStrokeOnlyProjection = true;
  geometry.userData.kidsGalaxyStrokeWrapDegrees = STROKE_WRAP_DEGREES;
  geometry.userData.kidsGalaxyStrokeLatitudeProjection = true;
  geometry.userData.kidsGalaxyStrokeLatitudeDegrees = LATITUDE_DEGREES;
  geometry.userData.kidsGalaxyStrokeWrapLongitudeMin = THREE.MathUtils.radToDeg(minimumLongitude);
  geometry.userData.kidsGalaxyStrokeWrapLongitudeMax = THREE.MathUtils.radToDeg(maximumLongitude);
  geometry.userData.kidsGalaxyStrokeLatitudeMin = THREE.MathUtils.radToDeg(minimumLatitude);
  geometry.userData.kidsGalaxyStrokeLatitudeMax = THREE.MathUtils.radToDeg(maximumLatitude);
  geometry.userData.kidsGalaxySourceCanvasQuadCount = quadCount;
  geometry.userData.kidsGalaxyPatchRelief = PAINT_RELIEF;
  return geometry;
}

function disposeObject(object) {
  if (!object) return;
  object.parent?.remove(object);
  object.traverse((child) => {
    child.geometry?.dispose();
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function applyAreaFillProjection(entity, texture) {
  if (!hasExplicitBodyColor(entity)) return false;
  const bodyRgb = parseHexColour(entity.bodyColor);
  if (!bodyRgb) return false;
  const pixels = makeSample(texture, bodyRgb);
  if (!pixels) return false;
  const analysis = analyseAreaFill(pixels, bodyRgb);
  if (!analysis.useAreaFill) return false;

  const geometry = createAreaFillGeometry(pixels, analysis);
  if (!geometry) return false;

  if (entity.areaFillProjectionGroup) disposeObject(entity.areaFillProjectionGroup);
  if (entity.sculptedArtworkGroup) entity.sculptedArtworkGroup.visible = false;
  entity.accentEdgeMesh.visible = false;
  entity.accentMesh.visible = false;

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.5,
    metalness: 0.001,
    clearcoat: 0.055,
    clearcoatRoughness: 0.7,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.kidsGalaxySourceCanvasAreaFill = true;
  mesh.userData.kidsGalaxyKidPatchIndex = 0;

  const group = new THREE.Group();
  group.userData.kidsGalaxySculptedArtworkGroup = true;
  group.userData.kidsGalaxySourceCanvasAreaFill = true;
  group.userData.kidsGalaxyAreaFillCoverage = analysis.coverage;
  group.userData.kidsGalaxyAreaFillBroadRows = analysis.broadRows;
  group.userData.kidsGalaxyAngularStrokeWrap = true;
  group.userData.kidsGalaxyStrokeOnlyProjection = true;
  group.userData.kidsGalaxyStrokeWrapDegrees = STROKE_WRAP_DEGREES;
  group.userData.kidsGalaxyStrokeWrapPrimaryPatchCount = 1;
  group.userData.kidsGalaxyStrokeLatitudeProjection = true;
  group.userData.kidsGalaxyStrokeLatitudeDegrees = LATITUDE_DEGREES;
  group.userData.kidsGalaxyStrokeProjectionMode = 'source-canvas-area-fill-480x180';
  group.userData.kidsGalaxyDesignProjectionMode = 'source-canvas-area-fill-480x180';
  group.add(mesh);
  entity.mesh.add(group);
  entity.areaFillProjectionGroup = group;

  const data = entity.mesh?.material?.userData;
  if (data) {
    data.kidsGalaxySourceCanvasAreaFill = true;
    data.kidsGalaxyAreaFillCoverage = analysis.coverage;
    data.kidsGalaxyAreaFillBroadRows = analysis.broadRows;
    data.kidsGalaxyStrokeWrapDegrees = STROKE_WRAP_DEGREES;
    data.kidsGalaxyStrokeLatitudeDegrees = LATITUDE_DEGREES;
    data.kidsGalaxyStrokeProjectionMode = group.userData.kidsGalaxyStrokeProjectionMode;
    data.kidsGalaxyDesignProjectionMode = group.userData.kidsGalaxyDesignProjectionMode;
    // Keep the stable explicit-body contract used by deployed QA while the
    // more specific source-canvas mode is exposed through kidsGalaxy* fields.
    data.designProjection = 'explicit-body-preserved-kid-traits-across-planet';
  }
  return true;
}

/**
 * Preserve large bucket/fill compositions directly from source canvas space.
 * Thin drawings keep the sculpted-stroke path. Fill-heavy drawings instead use
 * a dense tessellated surface so canvas Y survives as real spherical latitude:
 * top is +90° (north pole), bottom is -90° (south pole), and X still winds 480°.
 */
export function installAreaFillSphericalProjection() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyAreaFillSphericalProjection) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function areaFillProjectedTexture(texture) {
    previousApplyTexture.call(this, texture);
    applyAreaFillProjection(this, texture);
  }

  areaFillProjectedTexture.kidsGalaxyAreaFillSphericalProjection = true;
  PlanetEntity.prototype.applyTexture = areaFillProjectedTexture;
}
