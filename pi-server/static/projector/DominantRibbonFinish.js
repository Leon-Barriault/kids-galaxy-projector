import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

function closeCurvedCap(mesh) {
  const geometry = mesh?.geometry;
  if (!geometry?.userData?.kidsGalaxyDominantGesturePatch) return false;
  if (!geometry.userData.kidsGalaxyRoundedSlab) return false;
  if (geometry.userData.kidsGalaxyDominantCapDoubleWound) return true;

  const index = geometry.getIndex();
  const ringCount = Number(geometry.userData.kidsGalaxyRoundedSlabRingCount) || 0;
  const ringSize = Number(geometry.userData.kidsGalaxyRaisedPatchContourVertices) || 0;
  if (!index || ringCount < 2 || ringSize < 3) return false;

  const source = Array.from(index.array);
  const sideIndexCount = (ringCount - 1) * ringSize * 6;
  if (sideIndexCount >= source.length) return false;

  const doubled = source.slice();
  for (let cursor = sideIndexCount; cursor + 2 < source.length; cursor += 3) {
    const a = source[cursor];
    const b = source[cursor + 1];
    const c = source[cursor + 2];
    doubled.push(a, c, b);
  }
  geometry.setIndex(doubled);
  geometry.userData.kidsGalaxyDominantCapDoubleWound = true;
  geometry.userData.kidsGalaxyDominantCapOriginalTriangles =
    (source.length - sideIndexCount) / 3;
  geometry.userData.kidsGalaxyDominantCapClosingTriangles =
    (doubled.length - source.length) / 3;
  return true;
}

function saturateRibbon(mesh) {
  const geometry = mesh?.geometry;
  const colours = geometry?.getAttribute?.('color');
  if (!colours || geometry.userData.kidsGalaxyDominantRibbonColourFinish) return;

  const colour = new THREE.Color();
  for (let index = 0; index < colours.count; index += 1) {
    colour.setRGB(
      colours.getX(index),
      colours.getY(index),
      colours.getZ(index),
    );
    colour.offsetHSL(0, 0.045, -0.012);
    colours.setXYZ(index, colour.r, colour.g, colour.b);
  }
  colours.needsUpdate = true;
  geometry.userData.kidsGalaxyDominantRibbonColourFinish = true;
}

function finishDominantRibbons(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return;

  let ribbonCount = 0;
  let closedCount = 0;
  group.children.forEach((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.userData?.kidsGalaxyDominantGesturePatch) return;
    ribbonCount += 1;
    if (closeCurvedCap(mesh)) closedCount += 1;
    saturateRibbon(mesh);
    // Keep the sidewall front-sided. Only the cap triangles are duplicated, so
    // this avoids the black flipped-normal outline caused by DoubleSide materials.
    mesh.material.side = THREE.FrontSide;
    mesh.material.shadowSide = THREE.FrontSide;
    mesh.material.needsUpdate = true;
  });

  group.userData.kidsGalaxyDominantRibbonFinalCount = ribbonCount;
  group.userData.kidsGalaxyDominantRibbonClosedCapCount = closedCount;
  entity.mesh.material.userData.kidsGalaxyDominantRibbonFinalCount = ribbonCount;
  entity.mesh.material.userData.kidsGalaxyDominantRibbonClosedCapCount = closedCount;
}

/** Final cap/colour correction for low-profile same-hue kid ribbons. */
export function installDominantRibbonFinish() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyDominantRibbonFinish) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function dominantRibbonTexture(texture) {
    previousApplyTexture.call(this, texture);
    finishDominantRibbons(this);
  }

  dominantRibbonTexture.kidsGalaxyDominantRibbonFinish = true;
  PlanetEntity.prototype.applyTexture = dominantRibbonTexture;
}
