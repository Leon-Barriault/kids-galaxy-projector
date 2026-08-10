import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BODY_CONTACT_RADIUS = 1.056;
const MID_CROWN_RISE = 0.007;
const INNER_CROWN_RISE = 0.013;
const DOME_CENTRE_RISE = 0.018;

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
  const sampleCount = Math.min(count, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const vertex = start + Math.floor((index / sampleCount) * count);
    colour.r += colours.getX(vertex);
    colour.g += colours.getY(vertex);
    colour.b += colours.getZ(vertex);
  }
  return colour.multiplyScalar(1 / Math.max(1, sampleCount));
}

function extractDirections(position, start, count) {
  const result = [];
  for (let index = 0; index < count; index += 1) {
    result.push(
      new THREE.Vector3(
        position.getX(start + index),
        position.getY(start + index),
        position.getZ(start + index),
      ).normalize(),
    );
  }
  return result;
}

function smoothClosedDirections(input, passes = 4) {
  let current = input.map((vector) => vector.clone());
  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((vector, index) => {
      const previous = current[(index - 1 + current.length) % current.length];
      const next = current[(index + 1) % current.length];
      return previous
        .clone()
        .multiplyScalar(0.2)
        .add(vector.clone().multiplyScalar(0.6))
        .add(next.clone().multiplyScalar(0.2))
        .normalize();
    });
  }
  return current;
}

function pushVertex(positions, colours, vector, colour) {
  positions.push(vector.x, vector.y, vector.z);
  colours.push(colour.r, colour.g, colour.b);
}

function blendDirection(boundary, centre, amount) {
  return boundary.clone().lerp(centre, amount).normalize();
}

function softenedRadius(sourceRadius, fraction) {
  return BODY_CONTACT_RADIUS + Math.max(0, sourceRadius - BODY_CONTACT_RADIUS) * fraction;
}

function installReferenceNormals(geometry, ringSize, fullRings) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;

  const actual = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const blended = new THREE.Vector3();
  const actualWeights = [0.42, 0.44, 0.5, 0.42, 0.32];

  for (let ring = 0; ring < fullRings; ring += 1) {
    const weight = actualWeights[ring] ?? 0.25;
    for (let index = 0; index < ringSize; index += 1) {
      const vertex = ring * ringSize + index;
      actual.set(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)).normalize();
      radial
        .set(position.getX(vertex), position.getY(vertex), position.getZ(vertex))
        .normalize();
      blended.copy(radial).multiplyScalar(1 - weight).addScaledVector(actual, weight).normalize();
      normal.setXYZ(vertex, blended.x, blended.y, blended.z);
    }
  }

  const centre = fullRings * ringSize;
  actual.set(normal.getX(centre), normal.getY(centre), normal.getZ(centre)).normalize();
  radial
    .set(position.getX(centre), position.getY(centre), position.getZ(centre))
    .normalize();
  blended.copy(radial).multiplyScalar(0.8).addScaledVector(actual, 0.2).normalize();
  normal.setXYZ(centre, blended.x, blended.y, blended.z);
  normal.needsUpdate = true;
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

  const outerRadius = averageRingRadius(sourcePosition, outerStart, ringSize);
  const shoulderRadius = softenedRadius(
    averageRingRadius(sourcePosition, shoulderStart, ringSize),
    0.84,
  );
  const topRadius = softenedRadius(
    averageRingRadius(sourcePosition, topStart, ringSize),
    0.76,
  );

  // Derive the entire bevel from the kid's top colour. The previous pipeline's
  // edge colour was intentionally much darker and could read as a black outline
  // even after geometric smoothing. The reference planets keep their shoulder
  // unmistakably in the same hue.
  const topColour = ringColour(sourceColour, topStart, ringSize);
  const outerColour = topColour.clone().offsetHSL(0, -0.004, -0.055);
  const shoulderColour = topColour.clone().offsetHSL(0, -0.002, -0.026);
  const midColour = topColour.clone().offsetHSL(0, 0.002, 0.008);
  const innerColour = topColour.clone().offsetHSL(0, 0.003, 0.014);
  const centreColour = topColour.clone().offsetHSL(0, 0.004, 0.018);

  const outerDirections = smoothClosedDirections(
    extractDirections(sourcePosition, outerStart, ringSize),
  );
  const shoulderDirections = smoothClosedDirections(
    extractDirections(sourcePosition, shoulderStart, ringSize),
  );
  const topDirections = smoothClosedDirections(
    extractDirections(sourcePosition, topStart, ringSize),
  );

  const centreDirection = new THREE.Vector3();
  topDirections.forEach((direction) => centreDirection.add(direction));
  centreDirection.normalize();

  const positions = [];
  const colours = [];
  const sourceRings = [
    { directions: outerDirections, radius: outerRadius, colour: outerColour },
    { directions: shoulderDirections, radius: shoulderRadius, colour: shoulderColour },
    { directions: topDirections, radius: topRadius, colour: topColour },
  ];
  sourceRings.forEach(({ directions, radius, colour }) => {
    directions.forEach((direction) => {
      pushVertex(
        positions,
        colours,
        direction.clone().multiplyScalar(radius),
        colour,
      );
    });
  });

  const crownDefinitions = [
    { amount: 0.3, radius: topRadius + MID_CROWN_RISE, colour: midColour },
    { amount: 0.62, radius: topRadius + INNER_CROWN_RISE, colour: innerColour },
  ];
  crownDefinitions.forEach(({ amount, radius, colour }) => {
    topDirections.forEach((boundary) => {
      pushVertex(
        positions,
        colours,
        blendDirection(boundary, centreDirection, amount).multiplyScalar(radius),
        colour,
      );
    });
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
  installReferenceNormals(geometry, ringSize, fullRings);
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...sourceGeometry.userData,
    kidsGalaxySculptedKidPatch: true,
    kidsGalaxyBeveledKidPatch: true,
    kidsGalaxyDomedKidPatch: true,
    kidsGalaxyReferenceRoundedRelief: true,
    kidsGalaxySmoothSphereFollowingNormals: true,
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
  material.roughness = 0.28;
  material.metalness = 0.001;
  material.clearcoat = 0.18;
  material.clearcoatRoughness = 0.34;
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
    mesh.receiveShadow = false;
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

/** Final geometry pass: turn flat patch caps into softly lit molded forms. */
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
