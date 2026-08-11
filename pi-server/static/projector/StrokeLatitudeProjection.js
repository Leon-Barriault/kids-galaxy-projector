import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const STROKE_LATITUDE_DEGREES = 130;
const HALF_LATITUDE_RADIANS = THREE.MathUtils.degToRad(STROKE_LATITUDE_DEGREES / 2);
const MIN_SOURCE_HALF_HEIGHT = 0.08;

function hasExplicitBodyColor(entity) {
  return typeof entity?.bodyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(entity.bodyColor);
}

function wrappedStrokeMeshes(group) {
  return (group?.children || []).filter((child) =>
    child.isMesh &&
    child.visible !== false &&
    child.geometry?.userData?.kidsGalaxyStrokeOnlyProjection &&
    !child.userData?.kidsGalaxyBackDesignEcho &&
    !child.userData?.kidsGalaxySuppressedWhiteDiscRim,
  );
}

function sourceYBounds(meshes) {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const vertex = new THREE.Vector3();

  meshes.forEach((mesh) => {
    const position = mesh.geometry?.getAttribute?.('position');
    if (!position?.count) return;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).normalize();
      minY = Math.min(minY, vertex.y);
      maxY = Math.max(maxY, vertex.y);
    }
  });

  return Number.isFinite(minY) && Number.isFinite(maxY) ? { minY, maxY } : null;
}

function mapGeometryToLatitude(geometry, bounds) {
  const position = geometry?.getAttribute?.('position');
  if (!position?.count || !bounds) return false;

  const centreY = (bounds.minY + bounds.maxY) * 0.5;
  const halfHeight = Math.max(MIN_SOURCE_HALF_HEIGHT, (bounds.maxY - bounds.minY) * 0.5);
  const vertex = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normals = new Float32Array(position.count * 3);
  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const radius = vertex.length();
    if (radius <= 0.000001) continue;

    direction.copy(vertex).multiplyScalar(1 / radius);
    const authoredY = THREE.MathUtils.clamp((direction.y - centreY) / halfHeight, -1, 1);
    const latitude = authoredY * HALF_LATITUDE_RADIANS;
    const longitude = Math.atan2(direction.x, direction.z);
    const horizontalRadius = Math.cos(latitude);

    normal.set(
      Math.sin(longitude) * horizontalRadius,
      Math.sin(latitude),
      Math.cos(longitude) * horizontalRadius,
    ).normalize();

    position.setXYZ(
      index,
      normal.x * radius,
      normal.y * radius,
      normal.z * radius,
    );
    normals[index * 3] = normal.x;
    normals[index * 3 + 1] = normal.y;
    normals[index * 3 + 2] = normal.z;
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }

  position.needsUpdate = true;
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.attributes.normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxyStrokeLatitudeProjection = true;
  geometry.userData.kidsGalaxyStrokeLatitudeDegrees = STROKE_LATITUDE_DEGREES;
  geometry.userData.kidsGalaxyStrokeLatitudeMin = THREE.MathUtils.radToDeg(minLatitude);
  geometry.userData.kidsGalaxyStrokeLatitudeMax = THREE.MathUtils.radToDeg(maxLatitude);
  return true;
}

function applyLatitudeProjection(entity) {
  if (!hasExplicitBodyColor(entity)) return false;
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;

  const meshes = wrappedStrokeMeshes(group);
  const bounds = sourceYBounds(meshes);
  if (!bounds || !meshes.length) return false;

  let projected = 0;
  meshes.forEach((mesh) => {
    if (mapGeometryToLatitude(mesh.geometry, bounds)) projected += 1;
  });

  group.userData.kidsGalaxyStrokeLatitudeProjection = true;
  group.userData.kidsGalaxyStrokeLatitudeDegrees = STROKE_LATITUDE_DEGREES;
  group.userData.kidsGalaxyStrokeLatitudePatchCount = projected;
  group.userData.kidsGalaxyStrokeProjectionMode = 'longitude-480-latitude-130';

  const data = entity.mesh?.material?.userData;
  if (data) {
    data.kidsGalaxyStrokeLatitudeProjection = true;
    data.kidsGalaxyStrokeLatitudeDegrees = STROKE_LATITUDE_DEGREES;
    data.kidsGalaxyStrokeLatitudePatchCount = projected;
    data.kidsGalaxyStrokeProjectionMode = group.userData.kidsGalaxyStrokeProjectionMode;
  }
  return projected > 0;
}

/**
 * Add explicit source-Y to spherical-latitude mapping after the 480-degree
 * longitudinal stroke wrap. X owns longitude; Y now owns latitude instead of
 * inheriting a mostly planar height value from the earlier sculpting stages.
 */
export function installStrokeLatitudeProjection() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyStrokeLatitudeProjection) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function latitudeProjectedTexture(texture) {
    previousApplyTexture.call(this, texture);
    applyLatitudeProjection(this);
  }
  latitudeProjectedTexture.kidsGalaxyStrokeLatitudeProjection = true;
  PlanetEntity.prototype.applyTexture = latitudeProjectedTexture;
}
