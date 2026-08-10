import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const ANALYSIS_PALETTE = [
  '#e53935',
  '#ff9800',
  '#ffeb3b',
  '#4caf50',
  '#2196f3',
  '#9c27b0',
  '#e91e63',
  '#000000',
].map((hex) => new THREE.Color(hex));

const SENTINEL_DISTANCE_MARGIN = 0.018;

function averageVertexColour(mesh) {
  const attribute = mesh.geometry?.getAttribute?.('color');
  if (!attribute?.count) return null;
  const average = new THREE.Color(0, 0, 0);
  const stride = Math.max(1, Math.floor(attribute.count / 96));
  let samples = 0;
  for (let index = 0; index < attribute.count; index += stride) {
    average.r += attribute.getX(index);
    average.g += attribute.getY(index);
    average.b += attribute.getZ(index);
    samples += 1;
  }
  return average.multiplyScalar(1 / Math.max(1, samples));
}

function colourDistanceSquared(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function isClearlySentinel(colour, sentinelIndex, usedIndexes) {
  const sentinel = ANALYSIS_PALETTE[sentinelIndex];
  if (!sentinel) return false;
  const sentinelDistance = colourDistanceSquared(colour, sentinel);
  const childIndexes = usedIndexes.filter(
    (index) => index >= 0 && index < ANALYSIS_PALETTE.length && index !== sentinelIndex,
  );
  if (!childIndexes.length) return true;

  const closestChildDistance = Math.min(
    ...childIndexes.map((index) => colourDistanceSquared(colour, ANALYSIS_PALETTE[index])),
  );
  return sentinelDistance + SENTINEL_DISTANCE_MARGIN < closestChildDistance;
}

function releaseMesh(mesh) {
  mesh.parent?.remove(mesh);
  mesh.geometry?.dispose?.();
  if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material?.dispose?.());
  else mesh.material?.dispose?.();
}

function cleanSentinelGeometry(entity) {
  const group = entity.sculptedArtworkGroup;
  const data = entity.mesh?.material?.userData;
  if (!group?.userData?.kidsGalaxyExplicitBodyArtwork || !data) return;

  const sentinelIndex = Number(data.kidsGalaxyExplicitBodySentinelIndex);
  if (!Number.isInteger(sentinelIndex) || !ANALYSIS_PALETTE[sentinelIndex]) return;
  const usedIndexes = Array.isArray(data.kidsGalaxyExplicitBodyUsedPaletteIndexes)
    ? data.kidsGalaxyExplicitBodyUsedPaletteIndexes.map(Number).filter(Number.isInteger)
    : [];

  let removed = 0;
  [...group.children].forEach((child) => {
    if (!child.isMesh || !child.userData?.kidsGalaxyExplicitBodyPatch) return;
    const average = averageVertexColour(child);
    if (!average || !isClearlySentinel(average, sentinelIndex, usedIndexes)) return;
    releaseMesh(child);
    removed += 1;
  });

  const remainingFront = group.children.filter(
    (child) => child.userData?.kidsGalaxyExplicitBodyPatch &&
      !child.userData?.kidsGalaxyBackDesignEcho,
  ).length;
  group.userData.componentCount = remainingFront;
  group.userData.kidsGalaxyExplicitBodySentinelMeshesRemoved = removed;
  data.kidsGalaxyExplicitBodyPatchCount = remainingFront;
  data.kidsGalaxyExplicitBodySentinelMeshesRemoved = removed;
}

/** Remove the internal analysis background after the normal sculptor runs. */
export function installExplicitBodySentinelCleanup() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyExplicitBodySentinelCleanup) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function explicitBodySentinelCleanupTexture(texture) {
    previousApplyTexture.call(this, texture);
    cleanSentinelGeometry(this);
  }

  explicitBodySentinelCleanupTexture.kidsGalaxyExplicitBodySentinelCleanup = true;
  PlanetEntity.prototype.applyTexture = explicitBodySentinelCleanupTexture;
}
