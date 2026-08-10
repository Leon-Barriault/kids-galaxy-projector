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

  // The reference has a same-hue shoulder, not an outline. Keep only enough
  // tonal falloff to reveal thickness when the light grazes the molded piece.
  const lower = base.clone().offsetHSL(0, -0.004, -0.038);
  const shoulder = base.clone().offsetHSL(0, -0.001, -0.016);
  const top = base.clone().offsetHSL(0, 0.008, 0.012);
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
  geometry.userData.kidsGalaxyNoDarkOutline = true;
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

    child.material.side = THREE.DoubleSide;
    child.material.shadowSide = THREE.DoubleSide;
    child.material.roughness = 0.45;
    child.material.metalness = 0.001;
    child.material.clearcoat = 0.065;
    child.material.clearcoatRoughness = 0.64;
    child.material.dithering = true;
    child.material.polygonOffset = true;
    child.material.polygonOffsetFactor = -0.04;
    child.material.polygonOffsetUnits = -0.04;

    // Point-light shadow maps made the first real-geometry pass read as if it
    // had a black ink outline. The bevel itself supplies depth; letting it
    // receive light/shadow while not casting a hard self-shadow matches the
    // soft studio contact depth in the supplied clay/plastic references.
    child.castShadow = false;
    child.receiveShadow = true;
    child.material.needsUpdate = true;
  });
  group.userData.kidsGalaxyVisibleSculptedPatchCount = patchCount;
  group.userData.kidsGalaxySmoothedReferenceFinish = true;
  group.userData.kidsGalaxySoftContactEdges = true;
  if (body) {
    body.userData.kidsGalaxyVisibleSculptedPatchCount = patchCount;
    body.userData.kidsGalaxySculptedGeometryVisible = patchCount > 0;
    body.userData.kidsGalaxySmoothedReferenceFinish = true;
    body.userData.kidsGalaxySoftContactEdges = true;
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
