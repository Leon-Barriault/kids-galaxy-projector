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

function nearestPaletteIndex(colour) {
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  ANALYSIS_PALETTE.forEach((candidate, index) => {
    const dr = colour.r - candidate.r;
    const dg = colour.g - candidate.g;
    const db = colour.b - candidate.b;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  return nearest;
}

function sentinelPaletteIndex(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return -1;
  const sentinel = new THREE.Color(hex);
  return nearestPaletteIndex(sentinel);
}

function disposeMesh(mesh) {
  mesh.parent?.remove(mesh);
  mesh.geometry?.dispose?.();
  if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material?.dispose?.());
  else mesh.material?.dispose?.();
}

function cleanSentinelGeometry(entity) {
  const group = entity.sculptedArtworkGroup;
  const data = entity.mesh?.material?.userData;
  if (!group?.userData?.kidsGalaxyExplicitBodyArtwork || !data) return;

  const sentinelIndex = sentinelPaletteIndex(data.kidsGalaxyExplicitBodySentinel);
  if (sentinelIndex < 0) return;

  let removed = 0;
  [...group.children].forEach((child) => {
    if (!child.isMesh || !child.userData?.kidsGalaxyExplicitBodyPatch) return;
    const average = averageVertexColour(child);
    if (!average || nearestPaletteIndex(average) !== sentinelIndex) return;
    disposeMesh(child);
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
