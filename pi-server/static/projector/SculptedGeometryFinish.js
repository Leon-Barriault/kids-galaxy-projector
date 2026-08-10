import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

function finishSculptedGroup(entity) {
  const group = entity.sculptedArtworkGroup;
  const body = entity.mesh?.material;
  if (body) {
    body.userData.kidsGalaxySculptedGroupPresent = Boolean(group);
    body.userData.kidsGalaxySculptedGroupChildren = group?.children?.length || 0;
  }
  if (!group) return;

  let patchCount = 0;
  group.traverse((child) => {
    if (!child.isMesh || !child.geometry?.userData?.kidsGalaxySculptedKidPatch) return;
    patchCount += 1;
    // Curving a triangulated 2D contour over the globe can invert winding on
    // some highly concave child shapes. Render both sides; the physical shell
    // itself still has explicit sloped side faces and real depth.
    child.material.side = THREE.DoubleSide;
    child.material.shadowSide = THREE.DoubleSide;
    child.material.polygonOffset = true;
    child.material.polygonOffsetFactor = -0.25;
    child.material.polygonOffsetUnits = -0.25;
    child.material.needsUpdate = true;
  });
  group.userData.kidsGalaxyVisibleSculptedPatchCount = patchCount;
  if (body) {
    body.userData.kidsGalaxyVisibleSculptedPatchCount = patchCount;
    body.userData.kidsGalaxySculptedGeometryVisible = patchCount > 0;
  }
}

export function installSculptedGeometryFinish() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxySculptedGeometryFinish) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function visibleSculptedTexture(texture) {
    previousApplyTexture.call(this, texture);
    finishSculptedGroup(this);
  }

  visibleSculptedTexture.kidsGalaxySculptedGeometryFinish = true;
  PlanetEntity.prototype.applyTexture = visibleSculptedTexture;
}
