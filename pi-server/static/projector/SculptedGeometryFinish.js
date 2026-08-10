import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

function smoothPatchNormals(geometry) {
  const position = geometry.getAttribute('position');
  if (!position) return;
  const normals = new Float32Array(position.count * 3);
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index).normalize();
    normals[index * 3] = vertex.x;
    normals[index * 3 + 1] = vertex.y;
    normals[index * 3 + 2] = vertex.z;
  }
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.attributes.normal.needsUpdate = true;
  geometry.userData.kidsGalaxyRadialSmoothNormals = true;
}

function softenPatchColours(geometry) {
  const colors = geometry.getAttribute('color');
  const position = geometry.getAttribute('position');
  if (!colors || !position || position.count < 9) return;

  // SculptedArtworkGeometry creates three equal contour rings: lower edge,
  // shoulder and top. Recover the child colour from the top ring and keep the
  // sidewall visibly darker without the near-black outline of the first pass.
  const ringSize = Math.floor(position.count / 3);
  if (ringSize < 3) return;
  const base = new THREE.Color();
  const sampleCount = Math.min(ringSize, 24);
  for (let index = 0; index < sampleCount; index += 1) {
    const source = 2 * ringSize + Math.floor((index / sampleCount) * ringSize);
    base.r += colors.getX(source);
    base.g += colors.getY(source);
    base.b += colors.getZ(source);
  }
  base.multiplyScalar(1 / sampleCount);

  const lower = base.clone().offsetHSL(0, -0.006, -0.075);
  const shoulder = base.clone().offsetHSL(0, -0.002, -0.032);
  const top = base.clone().offsetHSL(0, 0.008, 0.008);
  const tones = [lower, shoulder, top];
  tones.forEach((tone, ring) => {
    const start = ring * ringSize;
    const end = Math.min(position.count, start + ringSize);
    for (let index = start; index < end; index += 1) {
      colors.setXYZ(index, tone.r, tone.g, tone.b);
    }
  });
  colors.needsUpdate = true;
  geometry.userData.kidsGalaxySoftSameHueBevel = true;
}

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
    smoothPatchNormals(child.geometry);
    softenPatchColours(child.geometry);

    // Concave child contours can invert some triangulated winding after being
    // curved over a sphere. Double-side keeps those pieces complete while the
    // explicit bevel geometry supplies their physical silhouette and depth.
    child.material.side = THREE.DoubleSide;
    child.material.shadowSide = THREE.DoubleSide;
    child.material.roughness = 0.47;
    child.material.metalness = 0.001;
    child.material.clearcoat = 0.06;
    child.material.clearcoatRoughness = 0.66;
    child.material.dithering = true;
    child.material.polygonOffset = true;
    child.material.polygonOffsetFactor = -0.08;
    child.material.polygonOffsetUnits = -0.08;
    child.material.needsUpdate = true;
  });
  group.userData.kidsGalaxyVisibleSculptedPatchCount = patchCount;
  group.userData.kidsGalaxySmoothedReferenceFinish = true;
  if (body) {
    body.userData.kidsGalaxyVisibleSculptedPatchCount = patchCount;
    body.userData.kidsGalaxySculptedGeometryVisible = patchCount > 0;
    body.userData.kidsGalaxySmoothedReferenceFinish = true;
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
