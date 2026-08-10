import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const FRONT_TARGET_HALF_WIDTH = 0.89;
const FRONT_TARGET_HALF_HEIGHT = 0.82;
const BACK_TARGET_HALF_WIDTH = 0.84;
const BACK_TARGET_HALF_HEIGHT = 0.77;
const MAX_DISC_RADIUS = 0.94;
const MIN_AXIS_SCALE = 1.0;
const MAX_AXIS_SCALE = 2.35;
const MAX_AXIS_RATIO = 1.28;

function patchMeshes(group, back) {
  return (group?.children || []).filter((child) =>
    child.isMesh &&
    child.geometry?.userData?.kidsGalaxySculptedKidPatch &&
    Boolean(child.userData?.kidsGalaxyBackDesignEcho) === back,
  );
}

function boundsFor(meshes) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const vertex = new THREE.Vector3();

  meshes.forEach((mesh) => {
    const position = mesh.geometry?.getAttribute?.('position');
    if (!position) return;
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index).normalize();
      bounds.minX = Math.min(bounds.minX, vertex.x);
      bounds.maxX = Math.max(bounds.maxX, vertex.x);
      bounds.minY = Math.min(bounds.minY, vertex.y);
      bounds.maxY = Math.max(bounds.maxY, vertex.y);
    }
  });

  if (!Number.isFinite(bounds.minX)) return null;
  return bounds;
}

function balancedScale(rawX, rawY) {
  let scaleX = THREE.MathUtils.clamp(rawX, MIN_AXIS_SCALE, MAX_AXIS_SCALE);
  let scaleY = THREE.MathUtils.clamp(rawY, MIN_AXIS_SCALE, MAX_AXIS_SCALE);

  // Fill the planet without turning a child's circle into a long oval. A small
  // amount of independent stretch is intentional; extreme anisotropy is not.
  if (scaleX > scaleY * MAX_AXIS_RATIO) scaleX = scaleY * MAX_AXIS_RATIO;
  if (scaleY > scaleX * MAX_AXIS_RATIO) scaleY = scaleX * MAX_AXIS_RATIO;
  return { scaleX, scaleY };
}

function transformFor(bounds, halfWidth, halfHeight) {
  if (!bounds) return null;
  const width = Math.max(0.08, bounds.maxX - bounds.minX);
  const height = Math.max(0.08, bounds.maxY - bounds.minY);
  const { scaleX, scaleY } = balancedScale(
    (halfWidth * 2) / width,
    (halfHeight * 2) / height,
  );
  return {
    centerX: (bounds.minX + bounds.maxX) * 0.5,
    centerY: (bounds.minY + bounds.maxY) * 0.5,
    scaleX,
    scaleY,
  };
}

function projectGeometry(geometry, transform) {
  const position = geometry?.getAttribute?.('position');
  if (!position || !transform) return;

  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const radius = vertex.length();
    if (radius <= 0.000001) continue;

    const direction = vertex.clone().multiplyScalar(1 / radius);
    const zSign = direction.z < 0 ? -1 : 1;
    let x = (direction.x - transform.centerX) * transform.scaleX;
    let y = (direction.y - transform.centerY) * transform.scaleY;
    const radial = Math.hypot(x, y);
    if (radial > MAX_DISC_RADIUS) {
      const clamp = MAX_DISC_RADIUS / radial;
      x *= clamp;
      y *= clamp;
    }
    const z = zSign * Math.sqrt(Math.max(0.02, 1 - x * x - y * y));
    position.setXYZ(index, x * radius, y * radius, z * radius);
  }

  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxyGlobalDesignProjection = true;
  geometry.userData.kidsGalaxyDesignScaleX = transform.scaleX;
  geometry.userData.kidsGalaxyDesignScaleY = transform.scaleY;
}

function applyProjection(meshes, halfWidth, halfHeight) {
  const before = boundsFor(meshes);
  const transform = transformFor(before, halfWidth, halfHeight);
  if (!transform) return null;
  meshes.forEach((mesh) => projectGeometry(mesh.geometry, transform));
  const after = boundsFor(meshes);
  return { before, after, ...transform };
}

function width(bounds) {
  return bounds ? bounds.maxX - bounds.minX : 0;
}

function height(bounds) {
  return bounds ? bounds.maxY - bounds.minY : 0;
}

function spreadKidArtwork(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;

  const front = patchMeshes(group, false);
  if (!front.length) return false;
  const back = patchMeshes(group, true);
  const frontProjection = applyProjection(
    front,
    FRONT_TARGET_HALF_WIDTH,
    FRONT_TARGET_HALF_HEIGHT,
  );
  const backProjection = back.length
    ? applyProjection(back, BACK_TARGET_HALF_WIDTH, BACK_TARGET_HALF_HEIGHT)
    : null;
  if (!frontProjection) return false;

  group.userData.kidsGalaxyGlobalDesignProjection = true;
  group.userData.kidsGalaxyDesignProjectionMode = 'preserved-traits-stretched-across-sphere';
  group.userData.kidsGalaxyProjectedFrontWidth = width(frontProjection.after);
  group.userData.kidsGalaxyProjectedFrontHeight = height(frontProjection.after);
  group.userData.kidsGalaxyProjectedBackWidth = width(backProjection?.after);
  group.userData.kidsGalaxyProjectedBackHeight = height(backProjection?.after);
  group.userData.kidsGalaxyDesignScaleX = frontProjection.scaleX;
  group.userData.kidsGalaxyDesignScaleY = frontProjection.scaleY;

  const data = entity.mesh.material.userData;
  data.kidsGalaxyGlobalDesignProjection = true;
  data.kidsGalaxyDesignProjectionMode = group.userData.kidsGalaxyDesignProjectionMode;
  data.kidsGalaxyProjectedFrontWidth = group.userData.kidsGalaxyProjectedFrontWidth;
  data.kidsGalaxyProjectedFrontHeight = group.userData.kidsGalaxyProjectedFrontHeight;
  data.kidsGalaxyProjectedBackWidth = group.userData.kidsGalaxyProjectedBackWidth;
  data.kidsGalaxyProjectedBackHeight = group.userData.kidsGalaxyProjectedBackHeight;
  data.kidsGalaxyDesignScaleX = frontProjection.scaleX;
  data.kidsGalaxyDesignScaleY = frontProjection.scaleY;
  return true;
}

/**
 * Preserve the child's extracted shapes and colours, but treat the complete
 * drawing as a planet-wide design. The component layout is recentered and
 * expanded as one composition instead of leaving the authored traits as a
 * small cluster on the sphere.
 */
export function installArtworkCoverageProjection() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyArtworkCoverageProjection) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function artworkCoverageTexture(texture) {
    previousApplyTexture.call(this, texture);
    spreadKidArtwork(this);
  }

  artworkCoverageTexture.kidsGalaxyArtworkCoverageProjection = true;
  PlanetEntity.prototype.applyTexture = artworkCoverageTexture;
}
