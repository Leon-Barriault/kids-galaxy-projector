import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BODY_RADIUS = 1.056;
const TARGET_RADII = [1.058, 1.075, 1.096, 1.114, 1.124];
const EXTRA_INSET = [0.0, 0.012, 0.026, 0.04, 0.055];
const LIGHTNESS = [-0.09, -0.055, -0.026, -0.006, 0.012];
const NORMAL_WEIGHTS = [0.86, 0.9, 0.8, 0.55, 0.2];

function averageTopColour(colors, start, count) {
  const colour = new THREE.Color();
  const samples = Math.min(count, 48);
  for (let index = 0; index < samples; index += 1) {
    const vertex = start + Math.floor((index / samples) * count);
    colour.r += colors.getX(vertex);
    colour.g += colors.getY(vertex);
    colour.b += colors.getZ(vertex);
  }
  return colour.multiplyScalar(1 / Math.max(samples, 1));
}

function patchCentreDirection(position, ringSize) {
  const centre = new THREE.Vector3();
  const topStart = (TARGET_RADII.length - 1) * ringSize;
  for (let index = 0; index < ringSize; index += 1) {
    centre.add(
      new THREE.Vector3(
        position.getX(topStart + index),
        position.getY(topStart + index),
        position.getZ(topStart + index),
      ).normalize(),
    );
  }
  return centre.normalize();
}

function retuneGeometry(geometry) {
  const ringSize = Number(geometry?.userData?.kidsGalaxyRaisedPatchContourVertices) || 0;
  const position = geometry?.getAttribute('position');
  const colors = geometry?.getAttribute('color');
  if (!ringSize || !position || !colors) return false;
  if (position.count !== ringSize * TARGET_RADII.length) return false;

  const centre = patchCentreDirection(position, ringSize);
  const topColour = averageTopColour(
    colors,
    (TARGET_RADII.length - 1) * ringSize,
    ringSize,
  );
  const direction = new THREE.Vector3();

  for (let ring = 0; ring < TARGET_RADII.length; ring += 1) {
    const ringColour = topColour
      .clone()
      .offsetHSL(0, ring < 2 ? -0.003 : 0.001, LIGHTNESS[ring]);
    for (let index = 0; index < ringSize; index += 1) {
      const vertex = ring * ringSize + index;
      direction
        .set(position.getX(vertex), position.getY(vertex), position.getZ(vertex))
        .normalize()
        .lerp(centre, EXTRA_INSET[ring])
        .normalize()
        .multiplyScalar(TARGET_RADII[ring]);
      position.setXYZ(vertex, direction.x, direction.y, direction.z);
      colors.setXYZ(vertex, ringColour.r, ringColour.g, ringColour.b);
    }
  }

  position.needsUpdate = true;
  colors.needsUpdate = true;
  geometry.computeVertexNormals();

  const normal = geometry.getAttribute('normal');
  const actual = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const blended = new THREE.Vector3();
  for (let ring = 0; ring < TARGET_RADII.length; ring += 1) {
    const weight = NORMAL_WEIGHTS[ring];
    for (let index = 0; index < ringSize; index += 1) {
      const vertex = ring * ringSize + index;
      actual.set(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)).normalize();
      radial
        .set(position.getX(vertex), position.getY(vertex), position.getZ(vertex))
        .normalize();
      blended
        .copy(radial)
        .multiplyScalar(1 - weight)
        .addScaledVector(actual, weight)
        .normalize();
      normal.setXYZ(vertex, blended.x, blended.y, blended.z);
    }
  }
  normal.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxyVisibleRoundedBevel = true;
  geometry.userData.kidsGalaxyPatchRelief = TARGET_RADII.at(-1) - BODY_RADIUS;
  geometry.userData.kidsGalaxyReferenceBevelWidth = EXTRA_INSET.at(-1);
  return true;
}

function tuneMaterial(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.roughness = 0.21;
  material.metalness = 0.001;
  material.clearcoat = 0.26;
  material.clearcoatRoughness = 0.27;
  material.emissive?.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.flatShading = false;
  material.needsUpdate = true;
  material.userData.kidsGalaxyVisibleRoundedBevel = true;
}

function applyDepthFinish(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;
  let count = 0;
  group.children.forEach((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.userData?.kidsGalaxyRoundedRaisedKidPatch) return;
    if (!retuneGeometry(mesh.geometry)) return;
    tuneMaterial(mesh.material);
    count += 1;
  });
  if (!count) return false;

  const body = entity.mesh.material;
  if (body?.isMeshPhysicalMaterial) {
    body.roughness = 0.29;
    body.clearcoat = 0.16;
    body.clearcoatRoughness = 0.33;
    body.needsUpdate = true;
  }
  group.userData.kidsGalaxyVisibleRoundedBevel = true;
  entity.mesh.material.userData.kidsGalaxyVisibleRoundedBevel = true;
  entity.mesh.material.userData.kidsGalaxyVisibleRoundedBevelPatchCount = count;
  return true;
}

/** Make the final smooth bevel readable without turning it into a domed button. */
export function installSculptedArtworkDepthFinish() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxySculptedDepthFinish) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function depthFinishedTexture(texture) {
    previousApplyTexture.call(this, texture);
    applyDepthFinish(this);
  }

  depthFinishedTexture.kidsGalaxySculptedDepthFinish = true;
  PlanetEntity.prototype.applyTexture = depthFinishedTexture;
}
