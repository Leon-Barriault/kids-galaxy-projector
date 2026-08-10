import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BODY_RADIUS = 1.05;
const STROKE_WRAP_DEGREES = 480;
const HALF_WRAP_RADIANS = THREE.MathUtils.degToRad(STROKE_WRAP_DEGREES / 2);
const FIRST_REVOLUTION_LIMIT = Math.PI;
const EXTRA_WRAP_TAPER = 0.68;
const MAX_ABS_Y = 0.94;

function hasExplicitBodyColor(entity) {
  return typeof entity?.bodyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(entity.bodyColor);
}

function patchMeshes(group, backEcho) {
  return (group?.children || []).filter((child) =>
    child.isMesh &&
    child.geometry?.userData?.kidsGalaxySculptedKidPatch &&
    Boolean(child.userData?.kidsGalaxyBackDesignEcho) === backEcho,
  );
}

function sourceBounds(meshes) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
  };
  const vertex = new THREE.Vector3();

  meshes.forEach((mesh) => {
    const position = mesh.geometry?.getAttribute?.('position');
    if (!position?.count) return;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).normalize();
      bounds.minX = Math.min(bounds.minX, vertex.x);
      bounds.maxX = Math.max(bounds.maxX, vertex.x);
    }
  });

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) return null;
  return bounds;
}

function postRevolutionTaper(longitude) {
  const overflow = Math.max(0, Math.abs(longitude) - FIRST_REVOLUTION_LIMIT);
  const available = Math.max(0.000001, HALF_WRAP_RADIANS - FIRST_REVOLUTION_LIMIT);
  const amount = THREE.MathUtils.clamp(overflow / available, 0, 1);
  return THREE.MathUtils.lerp(1, EXTRA_WRAP_TAPER, amount);
}

function wrapGeometry(geometry, bounds) {
  const position = geometry?.getAttribute?.('position');
  if (!position?.count || !bounds) return false;

  const centreX = (bounds.minX + bounds.maxX) * 0.5;
  const halfWidth = Math.max(0.04, (bounds.maxX - bounds.minX) * 0.5);
  const vertex = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const wrapped = new THREE.Vector3();
  const normals = new Float32Array(position.count * 3);
  let minAuthoredLongitude = Number.POSITIVE_INFINITY;
  let maxAuthoredLongitude = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const radius = vertex.length();
    if (radius <= 0.000001) continue;

    direction.copy(vertex).multiplyScalar(1 / radius);
    const authoredX = THREE.MathUtils.clamp((direction.x - centreX) / halfWidth, -1, 1);
    const longitude = authoredX * HALF_WRAP_RADIANS;
    const y = THREE.MathUtils.clamp(direction.y, -MAX_ABS_Y, MAX_ABS_Y);
    const horizontalRadius = Math.sqrt(Math.max(0.0001, 1 - y * y));
    wrapped.set(
      Math.sin(longitude) * horizontalRadius,
      y,
      Math.cos(longitude) * horizontalRadius,
    ).normalize();

    const relief = Math.max(0, radius - BODY_RADIUS);
    const taperedRadius = BODY_RADIUS + relief * postRevolutionTaper(longitude);
    position.setXYZ(
      index,
      wrapped.x * taperedRadius,
      wrapped.y * taperedRadius,
      wrapped.z * taperedRadius,
    );
    normals[index * 3] = wrapped.x;
    normals[index * 3 + 1] = wrapped.y;
    normals[index * 3 + 2] = wrapped.z;
    minAuthoredLongitude = Math.min(minAuthoredLongitude, longitude);
    maxAuthoredLongitude = Math.max(maxAuthoredLongitude, longitude);
  }

  position.needsUpdate = true;
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.attributes.normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxyStrokeOnlyProjection = true;
  geometry.userData.kidsGalaxyAngularStrokeWrap = true;
  geometry.userData.kidsGalaxyStrokeWrapDegrees = STROKE_WRAP_DEGREES;
  geometry.userData.kidsGalaxyStrokeWrapLongitudeMin = THREE.MathUtils.radToDeg(minAuthoredLongitude);
  geometry.userData.kidsGalaxyStrokeWrapLongitudeMax = THREE.MathUtils.radToDeg(maxAuthoredLongitude);
  geometry.userData.kidsGalaxyStrokeWrapReliefTaper = EXTRA_WRAP_TAPER;
  return true;
}

function enforceBodyColor(entity) {
  const material = entity.mesh?.material;
  if (!material?.isMaterial || !hasExplicitBodyColor(entity)) return false;

  material.color.copy(new THREE.Color(entity.bodyColor));
  material.map = null;
  material.bumpMap = null;
  material.displacementMap = null;
  material.emissiveMap = null;
  material.userData.kidsGalaxyExplicitBodyColor = entity.bodyColor.toLowerCase();
  material.userData.kidsGalaxyBodyColorSource = 'tablet-background';
  material.userData.kidsGalaxyBodyColorInferenceDisabled = true;
  material.userData.kidsGalaxyStrokeOnlyProjection = true;
  material.userData.kidsGalaxyStrokeWrapDegrees = STROKE_WRAP_DEGREES;
  material.userData.kidsGalaxyStrokeWrapMode = 'explicit-background-body-with-angular-stroke-wrap';
  material.needsUpdate = true;
  return true;
}

function prepareStrokeMaterial(mesh) {
  const material = mesh?.material;
  if (!material?.isMaterial) return;
  material.map = null;
  material.alphaMap = null;
  material.transparent = false;
  material.opacity = 1;
  material.depthWrite = true;
  material.vertexColors = true;
  material.color?.setHex(0xffffff);
  material.needsUpdate = true;
}

function wrapExplicitStrokes(entity) {
  if (!hasExplicitBodyColor(entity)) return false;
  enforceBodyColor(entity);

  // Explicit-body planets use true sculpted geometry for the authored marks.
  // The old alpha shells are never part of the final composition.
  entity.accentEdgeMesh.visible = false;
  entity.accentMesh.visible = false;

  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return true;

  const front = patchMeshes(group, false);
  const legacyBackEchoes = patchMeshes(group, true);
  const bounds = sourceBounds(front);
  if (!bounds || !front.length) return true;

  let wrappedCount = 0;
  front.forEach((mesh) => {
    prepareStrokeMaterial(mesh);
    if (wrapGeometry(mesh.geometry, bounds)) wrappedCount += 1;
  });

  // A 480-degree winding already reaches the far hemisphere and overlaps by
  // another 120 degrees. Keeping the old mirrored back copies would double the
  // artwork and recreate the separated side patches this stage replaces.
  legacyBackEchoes.forEach((mesh) => {
    mesh.visible = false;
    mesh.userData.kidsGalaxySuppressedLegacyBackEcho = true;
  });

  group.userData.kidsGalaxyStrokeOnlyProjection = true;
  group.userData.kidsGalaxyAngularStrokeWrap = true;
  group.userData.kidsGalaxyStrokeWrapDegrees = STROKE_WRAP_DEGREES;
  group.userData.kidsGalaxyStrokeWrapPrimaryPatchCount = wrappedCount;
  group.userData.kidsGalaxySuppressedLegacyBackEchoCount = legacyBackEchoes.length;
  group.userData.kidsGalaxyStrokeWrapReliefTaper = EXTRA_WRAP_TAPER;
  group.userData.kidsGalaxyDesignProjectionMode = 'explicit-background-body-strokes-wrapped-480-degrees';

  const data = entity.mesh.material.userData;
  data.kidsGalaxyAngularStrokeWrap = true;
  data.kidsGalaxyStrokeWrapPrimaryPatchCount = wrappedCount;
  data.kidsGalaxySuppressedLegacyBackEchoCount = legacyBackEchoes.length;
  data.kidsGalaxyStrokeWrapReliefTaper = EXTRA_WRAP_TAPER;
  data.kidsGalaxyDesignProjectionMode = group.userData.kidsGalaxyDesignProjectionMode;
  data.designProjection = 'explicit-background-body-with-stroke-only-480-degree-wrap';
  return true;
}

/**
 * Final explicit-body projection.
 *
 * The tablet-selected background is the planet body. Only the already-extracted
 * sculpted kid marks are remapped, winding 480 degrees longitudinally around
 * the globe. The extra 120 degrees gently reduce relief so the overlap reads as
 * a continuation of the drawing rather than a second raised copy.
 */
export function installStrokeWrapProjection() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyStrokeWrapProjection) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function strokeWrapTexture(texture) {
    previousApplyTexture.call(this, texture);
    wrapExplicitStrokes(this);
  }

  strokeWrapTexture.kidsGalaxyStrokeWrapProjection = true;
  PlanetEntity.prototype.applyTexture = strokeWrapTexture;
}
