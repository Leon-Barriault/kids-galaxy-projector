import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BASE_RADIUS = 1.056;
const RELIEF_MULTIPLIER = 1.34;

function tunePatchGeometry(geometry) {
  if (!geometry?.userData?.kidsGalaxySculptedKidPatch) return;
  const positions = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color');
  if (!positions) return;

  let maximumRadius = BASE_RADIUS;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, y, z);
    const relief = Math.max(0, radius - BASE_RADIUS);
    const tunedRadius = BASE_RADIUS + relief * RELIEF_MULTIPLIER;
    const scale = tunedRadius / Math.max(radius, 0.0001);
    positions.setXYZ(index, x * scale, y * scale, z * scale);
    maximumRadius = Math.max(maximumRadius, tunedRadius);

    if (colors) {
      // The original outer ring deliberately used a deep side colour. In the
      // supplied toy/clay references the shoulder is darker than the top, but
      // it stays unmistakably the same hue instead of reading like a black
      // outline. Lift the low-radius vertices most and preserve the crown.
      const normalized = THREE.MathUtils.clamp(relief / 0.052, 0, 1);
      const lift = THREE.MathUtils.lerp(1.28, 1.045, normalized);
      colors.setXYZ(
        index,
        Math.min(1, colors.getX(index) * lift),
        Math.min(1, colors.getY(index) * lift),
        Math.min(1, colors.getZ(index) * lift),
      );
    }
  }

  positions.needsUpdate = true;
  if (colors) colors.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxyReferenceRelief = maximumRadius - BASE_RADIUS;
  geometry.userData.kidsGalaxyReferenceRoundedRelief = true;
}

function tunePatchMaterial(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.roughness = 0.29;
  material.metalness = 0.001;
  material.clearcoat = 0.18;
  material.clearcoatRoughness = 0.34;
  material.emissive?.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.flatShading = false;
  material.needsUpdate = true;
  material.userData.kidsGalaxyReferenceToyFinish = true;
}

function tuneBody(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.roughness = 0.36;
  material.clearcoat = 0.1;
  material.clearcoatRoughness = 0.42;
  material.emissive?.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
  material.userData.kidsGalaxyReferenceBodyFinish = true;
}

function applyReferenceFinish(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;

  let patchCount = 0;
  let minimumRelief = Number.POSITIVE_INFINITY;
  group.children.forEach((mesh) => {
    if (!mesh.userData?.kidsGalaxySculptedKidPatch) return;
    tunePatchGeometry(mesh.geometry);
    tunePatchMaterial(mesh.material);
    patchCount += 1;
    minimumRelief = Math.min(
      minimumRelief,
      mesh.geometry.userData.kidsGalaxyReferenceRelief || 0,
    );
  });

  tuneBody(entity.mesh.material);
  group.userData.kidsGalaxyReferenceToyFinish = true;
  group.userData.kidsGalaxyReferencePatchCount = patchCount;
  group.userData.kidsGalaxyReferenceMinimumRelief = Number.isFinite(minimumRelief)
    ? minimumRelief
    : 0;
  entity.mesh.material.userData.kidsGalaxyReferenceToyFinish = true;
  return patchCount > 0;
}

/** Final physical-material/relief tuning after true kid geometry is built. */
export function installSculptedArtworkReferenceFinish() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxySculptedReferenceFinish) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function referenceFinishedTexture(texture) {
    previousApplyTexture.call(this, texture);
    applyReferenceFinish(this);
  }

  referenceFinishedTexture.kidsGalaxySculptedReferenceFinish = true;
  PlanetEntity.prototype.applyTexture = referenceFinishedTexture;
}
