import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

function brightenInstanceColours(mesh, lift) {
  if (!mesh?.isInstancedMesh || !mesh.instanceColor) return;
  const colour = new THREE.Color();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getColorAt(index, colour);
    colour.offsetHSL(0, -0.015, lift);
    mesh.setColorAt(index, colour);
  }
  mesh.instanceColor.needsUpdate = true;
}

function shrinkInstances(mesh, factor) {
  if (!mesh?.isInstancedMesh) return;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    scale.multiplyScalar(factor);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function clonePointLayer(layer, rotation, opacityScale) {
  const material = layer.material.clone();
  material.size *= 0.76;
  material.opacity *= opacityScale;
  const clone = new THREE.Points(layer.geometry.clone(), material);
  clone.rotation.z = rotation;
  clone.userData = { ...layer.userData, kidsGalaxyReferenceDensityClone: true };
  clone.userData.particleCount = layer.userData.particleCount || layer.geometry.attributes.position.count;
  clone.frustumCulled = false;
  return clone;
}

function tuneSaturnRing(entity) {
  const ring = entity.decorations?.find(
    (decoration) => decoration.userData?.kidsGalaxySaturnParticleRing,
  );
  if (!ring || ring.userData.kidsGalaxyReferenceRingFinish) return;

  const pointLayers = ring.children.filter(
    (child) => child.isPoints && child.userData?.kidsGalaxySaturnDust,
  );
  const chunks = ring.children.filter((child) => child.isInstancedMesh);

  pointLayers.forEach((layer, index) => {
    // Fine particles should merge optically into Saturn-style bands at normal
    // viewing distance rather than read as a dotted necklace.
    layer.material.size *= index === 0 ? 0.68 : 0.74;
    layer.material.opacity = Math.min(0.88, layer.material.opacity * 1.08);
    layer.material.needsUpdate = true;

    const cloneA = clonePointLayer(layer, 0.017 + index * 0.009, 0.72);
    const cloneB = clonePointLayer(layer, -0.026 - index * 0.011, 0.58);
    ring.add(cloneA, cloneB);
    ring.userData.kidsGalaxyRingParticleCount +=
      (cloneA.userData.particleCount || 0) + (cloneB.userData.particleCount || 0);
  });

  chunks.forEach((chunk) => {
    const rock = chunk.userData?.kidsGalaxyRingParticleKind === 'rock';
    shrinkInstances(chunk, rock ? 0.46 : 0.55);
    brightenInstanceColours(chunk, rock ? 0.13 : 0.07);
    chunk.material.roughness = rock ? 0.72 : 0.58;
    chunk.material.clearcoat = rock ? 0.018 : 0.045;
    chunk.castShadow = false;
    chunk.receiveShadow = false;
    chunk.material.needsUpdate = true;
  });

  ring.userData.kidsGalaxyReferenceRingFinish = true;
  ring.userData.kidsGalaxyUnresolvedParticleBands = true;
  ring.userData.kidsGalaxyVisibleChunkScale = 0.55;
}

/**
 * Saturn ring finish: smaller, brighter, unshadowed particle chunks.
 *
 * The body-material half of this stage was removed; the manifest surface
 * replaces that material wholesale.
 */
export function installReferenceFinish() {
  if (PlanetEntity.prototype.addPlanetRing?.kidsGalaxyReferenceFinish) return;
  const previousAddPlanetRing = PlanetEntity.prototype.addPlanetRing;

  function referenceFinishedRing() {
    previousAddPlanetRing.call(this);
    tuneSaturnRing(this);
  }

  referenceFinishedRing.kidsGalaxyReferenceFinish = true;
  PlanetEntity.prototype.addPlanetRing = referenceFinishedRing;
}
