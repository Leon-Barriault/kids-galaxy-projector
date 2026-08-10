import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BODY_CONTACT_RADIUS = 1.056;
const MID_CROWN_RISE = 0.014;
const INNER_CROWN_RISE = 0.025;
const DOME_CENTRE_RISE = 0.032;

function averageRingRadius(position, start, count) {
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const vertex = start + index;
    total += Math.hypot(
      position.getX(vertex),
      position.getY(vertex),
      position.getZ(vertex),
    );
  }
  return total / Math.max(1, count);
}

function ringColour(colours, start, count) {
  const colour = new THREE.Color();
  const sampleCount = Math.min(count, 32);
  for (let index = 0; index < sampleCount; index += 1) {
    const vertex = start + Math.floor((index / sampleCount) * count);
    colour.r += colours.getX(vertex);
    colour.g += colours.getY(vertex);
    colour.b += colours.getZ(vertex);
  }
  return colour.multiplyScalar(1 / Math.max(1, sampleCount));
}

function pushVertex(positions, colours, vector, colour) {
  positions.push(vector.x, vector.y, vector.z);
  colours.push(colour.r, colour.g, colour.b);
}

function blendDirection(boundary, centre, amount) {
  return boundary.clone().normalize().lerp(centre, amount).normalize();
}

function rebuildAsDome(sourceGeometry) {
  const sourcePosition = sourceGeometry.getAttribute('position');
  const sourceColour = sourceGeometry.getAttribute('color');
  if (!sourcePosition || !sourceColour || sourcePosition.count < 18) return null;
  if (sourcePosition.count % 3 !== 0) return null;

  const ringSize = sourcePosition.count / 3;
  const outerStart = 0;
  const shoulderStart = ringSize;
  const topStart = ringSize * 2;
  const topRadius = averageRingRadius(sourcePosition, topStart, ringSize);
  const topColour = ringColour(sourceColour, topStart, ringSize);
  const midColour = topColour.clone().offsetHSL(0, 0.004, 0.014);
  const innerColour = topColour.clone().offsetHSL(0, 0.006, 0.024);
  const centreColour = topColour.clone().offsetHSL(0, 0.008, 0.032);

  const centreDirection = new THREE.Vector3();
  for (let index = 0; index < ringSize; index += 1) {
    centreDirection.add(
      new THREE.Vector3(
        sourcePosition.getX(topStart + index),
        sourcePosition.getY(topStart + index),
        sourcePosition.getZ(topStart + index),
      ).normalize(),
    );
  }
  centreDirection.normalize();

  const positions = [];
  const colours = [];
  const sourceRings = [outerStart, shoulderStart, topStart];
  sourceRings.forEach((start) => {
    for (let index = 0; index < ringSize; index += 1) {
      const source = start + index;
      pushVertex(
        positions,
        colours,
        new THREE.Vector3(
          sourcePosition.getX(source),
          sourcePosition.getY(source),
          sourcePosition.getZ(source),
        ),
        new THREE.Color(
          sourceColour.getX(source),
          sourceColour.getY(source),
          sourceColour.getZ(source),
        ),
      );
    }
  });

  const crownDefinitions = [
    { amount: 0.36, radius: topRadius + MID_CROWN_RISE, colour: midColour },
    { amount: 0.7, radius: topRadius + INNER_CROWN_RISE, colour: innerColour },
  ];
  crownDefinitions.forEach(({ amount, radius, colour }) => {
    for (let index = 0; index < ringSize; index += 1) {
      const source = topStart + index;
      const boundary = new THREE.Vector3(
        sourcePosition.getX(source),
        sourcePosition.getY(source),
        sourcePosition.getZ(source),
      );
      pushVertex(
        positions,
        colours,
        blendDirection(boundary, centreDirection, amount).multiplyScalar(radius),
        colour,
      );
    }
  });

  const centreIndex = positions.length / 3;
  pushVertex(
    positions,
    colours,
    centreDirection.clone().multiplyScalar(topRadius + DOME_CENTRE_RISE),
    centreColour,
  );

  const indices = [];
  const fullRings = 5;
  for (let ring = 0; ring < fullRings - 1; ring += 1) {
    const currentStart = ring * ringSize;
    const nextStart = (ring + 1) * ringSize;
    for (let index = 0; index < ringSize; index += 1) {
      const next = (index + 1) % ringSize;
      indices.push(currentStart + index, nextStart + index, currentStart + next);
      indices.push(currentStart + next, nextStart + index, nextStart + next);
    }
  }
  const innerStart = (fullRings - 1) * ringSize;
  for (let index = 0; index < ringSize; index += 1) {
    const next = (index + 1) % ringSize;
    indices.push(innerStart + index, centreIndex, innerStart + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...sourceGeometry.userData,
    kidsGalaxySculptedKidPatch: true,
    kidsGalaxyBeveledKidPatch: true,
    kidsGalaxyDomedKidPatch: true,
    kidsGalaxyReferenceRoundedRelief: true,
    kidsGalaxyPatchVertexCount: positions.length / 3,
    kidsGalaxyPatchRelief: topRadius + DOME_CENTRE_RISE - BODY_CONTACT_RADIUS,
    kidsGalaxyDomeRingCount: fullRings,
  };
  return geometry;
}

function tuneMaterial(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.side = THREE.DoubleSide;
  material.shadowSide = THREE.DoubleSide;
  material.roughness = 0.25;
  material.metalness = 0.001;
  material.clearcoat = 0.23;
  material.clearcoatRoughness = 0.31;
  material.emissive?.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.flatShading = false;
  material.dithering = true;
  material.polygonOffset = false;
  material.needsUpdate = true;
  material.userData.kidsGalaxyDomedReferenceFinish = true;
}

function domeSculptedGroup(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;

  let count = 0;
  let minimumRelief = Number.POSITIVE_INFINITY;
  group.children.forEach((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.userData?.kidsGalaxySculptedKidPatch) return;
    const replacement = rebuildAsDome(mesh.geometry);
    if (!replacement) return;
    mesh.geometry.dispose();
    mesh.geometry = replacement;
    tuneMaterial(mesh.material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    count += 1;
    minimumRelief = Math.min(minimumRelief, replacement.userData.kidsGalaxyPatchRelief);
  });

  if (!count) return false;
  group.userData.kidsGalaxyDomedReferenceFinish = true;
  group.userData.kidsGalaxyDomedPatchCount = count;
  group.userData.kidsGalaxyDomedMinimumRelief = minimumRelief;
  entity.mesh.material.userData.kidsGalaxyDomedReferenceFinish = true;
  entity.mesh.material.userData.kidsGalaxyDomedPatchCount = count;
  entity.mesh.material.userData.kidsGalaxyDomedMinimumRelief = minimumRelief;
  return true;
}

/** Final geometry pass: convert flat patch caps into smoothly raised domes. */
export function installSculptedArtworkDomeFinish() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxySculptedDomeFinish) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function domedTexture(texture) {
    previousApplyTexture.call(this, texture);
    domeSculptedGroup(this);
  }

  domedTexture.kidsGalaxySculptedDomeFinish = true;
  PlanetEntity.prototype.applyTexture = domedTexture;
}
