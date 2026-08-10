import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BODY_RADIUS = 1.056;
const CONTACT_RADIUS = 1.058;
const LOWER_BEVEL_RADIUS = 1.069;
const UPPER_BEVEL_RADIUS = 1.086;
const TOP_EDGE_RADIUS = 1.100;
const TOP_SURFACE_RADIUS = 1.105;
const TOP_INNER_RADIUS = 1.106;

function ringColour(colours, start, count) {
  const colour = new THREE.Color();
  const samples = Math.min(count, 40);
  for (let index = 0; index < samples; index += 1) {
    const vertex = start + Math.floor((index / samples) * count);
    colour.r += colours.getX(vertex);
    colour.g += colours.getY(vertex);
    colour.b += colours.getZ(vertex);
  }
  return colour.multiplyScalar(1 / Math.max(1, samples));
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
    const previousPass = current;
    current = previousPass.map((vector, index) => {
      const previous = previousPass[(index - 1 + previousPass.length) % previousPass.length];
      const next = previousPass[(index + 1) % previousPass.length];
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

function interpolateDirections(from, to, amount) {
  return from.map((direction, index) =>
    direction.clone().lerp(to[index], amount).normalize(),
  );
}

function shrinkTowardCentre(directions, centre, amount) {
  return directions.map((direction) =>
    direction.clone().lerp(centre, amount).normalize(),
  );
}

function pushVertex(positions, colours, direction, radius, colour) {
  const vertex = direction.clone().multiplyScalar(radius);
  positions.push(vertex.x, vertex.y, vertex.z);
  colours.push(colour.r, colour.g, colour.b);
}

function installReferenceNormals(geometry, ringSize, fullRings) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;

  const actual = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const blended = new THREE.Vector3();
  // The bevel keeps enough physical normal to catch a rounded edge highlight;
  // the raised top becomes progressively sphere-following so it reads as a
  // molded layer conforming to the planet rather than a button or bubble.
  const actualWeights = [0.72, 0.82, 0.74, 0.54, 0.28, 0.16];

  for (let ring = 0; ring < fullRings; ring += 1) {
    const weight = actualWeights[ring] ?? 0.2;
    for (let index = 0; index < ringSize; index += 1) {
      const vertex = ring * ringSize + index;
      actual.set(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)).normalize();
      radial
        .set(position.getX(vertex), position.getY(vertex), position.getZ(vertex))
        .normalize();
      blended
        .copy(radial)
        .multiplyScalar(1 - weight)
        .addScaledVector(actual, weight)
        .normalize();
      normal.setXYZ(vertex, blended.x, blended.y, blended.z);
    }
  }

  const centreIndex = fullRings * ringSize;
  radial
    .set(
      position.getX(centreIndex),
      position.getY(centreIndex),
      position.getZ(centreIndex),
    )
    .normalize();
  normal.setXYZ(centreIndex, radial.x, radial.y, radial.z);
  normal.needsUpdate = true;
}

function rebuildAsRaisedPatch(sourceGeometry) {
  const sourcePosition = sourceGeometry.getAttribute('position');
  const sourceColour = sourceGeometry.getAttribute('color');
  if (!sourcePosition || !sourceColour || sourcePosition.count < 18) return null;
  if (sourcePosition.count % 3 !== 0) return null;

  const ringSize = sourcePosition.count / 3;
  const outerStart = 0;
  const shoulderStart = ringSize;
  const topStart = ringSize * 2;

  const outer = smoothClosedDirections(extractDirections(sourcePosition, outerStart, ringSize));
  const shoulder = smoothClosedDirections(
    extractDirections(sourcePosition, shoulderStart, ringSize),
  );
  const top = smoothClosedDirections(extractDirections(sourcePosition, topStart, ringSize));
  const centreDirection = new THREE.Vector3();
  top.forEach((direction) => centreDirection.add(direction));
  centreDirection.normalize();

  const topColour = ringColour(sourceColour, topStart, ringSize);
  const coloursByRing = [
    topColour.clone().offsetHSL(0, -0.004, -0.05),
    topColour.clone().offsetHSL(0, -0.003, -0.032),
    topColour.clone().offsetHSL(0, -0.001, -0.014),
    topColour.clone().offsetHSL(0, 0.001, 0.002),
    topColour.clone().offsetHSL(0, 0.002, 0.01),
    topColour.clone().offsetHSL(0, 0.002, 0.012),
  ];

  const rings = [
    { directions: outer, radius: CONTACT_RADIUS },
    {
      directions: interpolateDirections(outer, shoulder, 0.52),
      radius: LOWER_BEVEL_RADIUS,
    },
    { directions: shoulder, radius: UPPER_BEVEL_RADIUS },
    {
      directions: interpolateDirections(shoulder, top, 0.6),
      radius: TOP_EDGE_RADIUS,
    },
    { directions: top, radius: TOP_SURFACE_RADIUS },
    {
      directions: shrinkTowardCentre(top, centreDirection, 0.5),
      radius: TOP_INNER_RADIUS,
    },
  ];

  const positions = [];
  const colours = [];
  rings.forEach((ring, ringIndex) => {
    ring.directions.forEach((direction) => {
      pushVertex(
        positions,
        colours,
        direction,
        ring.radius,
        coloursByRing[ringIndex],
      );
    });
  });

  const centreIndex = positions.length / 3;
  pushVertex(
    positions,
    colours,
    centreDirection,
    TOP_INNER_RADIUS,
    coloursByRing[coloursByRing.length - 1],
  );

  const indices = [];
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    const currentStart = ring * ringSize;
    const nextStart = (ring + 1) * ringSize;
    for (let index = 0; index < ringSize; index += 1) {
      const next = (index + 1) % ringSize;
      indices.push(currentStart + index, nextStart + index, currentStart + next);
      indices.push(currentStart + next, nextStart + index, nextStart + next);
    }
  }

  const innerStart = (rings.length - 1) * ringSize;
  for (let index = 0; index < ringSize; index += 1) {
    const next = (index + 1) % ringSize;
    indices.push(innerStart + index, centreIndex, innerStart + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  installReferenceNormals(geometry, ringSize, rings.length);
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...sourceGeometry.userData,
    kidsGalaxySculptedKidPatch: true,
    kidsGalaxyBeveledKidPatch: true,
    kidsGalaxyRoundedRaisedKidPatch: true,
    kidsGalaxyReferenceRoundedRelief: true,
    kidsGalaxySmoothSphereFollowingNormals: true,
    kidsGalaxyPatchVertexCount: positions.length / 3,
    kidsGalaxyPatchRelief: TOP_INNER_RADIUS - BODY_RADIUS,
    kidsGalaxyRaisedPatchRingCount: rings.length,
  };
  return geometry;
}

function tuneMaterial(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.side = THREE.DoubleSide;
  material.shadowSide = THREE.DoubleSide;
  material.roughness = 0.23;
  material.metalness = 0.001;
  material.clearcoat = 0.24;
  material.clearcoatRoughness = 0.29;
  material.emissive?.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.flatShading = false;
  material.dithering = true;
  material.polygonOffset = false;
  material.needsUpdate = true;
  material.userData.kidsGalaxyRoundedRaisedReferenceFinish = true;
}

function tuneBody(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.roughness = 0.31;
  material.clearcoat = 0.14;
  material.clearcoatRoughness = 0.36;
  material.emissive?.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
}

function finishSculptedGroup(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;

  let count = 0;
  let minimumRelief = Number.POSITIVE_INFINITY;
  group.children.forEach((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.userData?.kidsGalaxySculptedKidPatch) return;
    const replacement = rebuildAsRaisedPatch(mesh.geometry);
    if (!replacement) return;
    mesh.geometry.dispose();
    mesh.geometry = replacement;
    tuneMaterial(mesh.material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    count += 1;
    minimumRelief = Math.min(
      minimumRelief,
      replacement.userData.kidsGalaxyPatchRelief,
    );
  });

  if (!count) return false;
  tuneBody(entity.mesh.material);
  group.userData.kidsGalaxyRoundedRaisedReferenceFinish = true;
  group.userData.kidsGalaxyRoundedRaisedPatchCount = count;
  group.userData.kidsGalaxyRoundedRaisedMinimumRelief = minimumRelief;
  entity.mesh.material.userData.kidsGalaxyRoundedRaisedReferenceFinish = true;
  entity.mesh.material.userData.kidsGalaxyRoundedRaisedPatchCount = count;
  entity.mesh.material.userData.kidsGalaxyRoundedRaisedMinimumRelief = minimumRelief;
  return true;
}

/**
 * Final geometry pass: broad rounded bevel + sphere-following raised top.
 * This matches the molded reference language without turning kid motifs into
 * either flat decals or peaked button-like domes.
 */
export function installSculptedArtworkDomeFinish() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxySculptedDomeFinish) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function roundedRaisedTexture(texture) {
    previousApplyTexture.call(this, texture);
    finishSculptedGroup(this);
  }

  roundedRaisedTexture.kidsGalaxySculptedDomeFinish = true;
  PlanetEntity.prototype.applyTexture = roundedRaisedTexture;
}
