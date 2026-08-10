import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BODY_RADIUS = 1.056;
const RINGS = [
  { inset: 0.0, radius: 1.058, lightness: -0.048 },
  { inset: 0.028, radius: 1.068, lightness: -0.032 },
  { inset: 0.058, radius: 1.082, lightness: -0.018 },
  { inset: 0.086, radius: 1.096, lightness: -0.004 },
  { inset: 0.108, radius: 1.104, lightness: 0.008 },
];

function ringColour(colours, start, count) {
  const colour = new THREE.Color();
  const samples = Math.min(count, 48);
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

function smoothClosedDirections(input, passes = 3) {
  let current = input.map((vector) => vector.clone());
  for (let pass = 0; pass < passes; pass += 1) {
    const previousPass = current;
    current = previousPass.map((vector, index) => {
      const previous = previousPass[(index - 1 + previousPass.length) % previousPass.length];
      const next = previousPass[(index + 1) % previousPass.length];
      return previous
        .clone()
        .multiplyScalar(0.18)
        .add(vector.clone().multiplyScalar(0.64))
        .add(next.clone().multiplyScalar(0.18))
        .normalize();
    });
  }
  return current;
}

function resampleClosedDirections(input) {
  const source = input.map((direction) => direction.clone().normalize());
  const targetCount = THREE.MathUtils.clamp(source.length * 3, 48, 128);
  const cumulative = [0];
  let total = 0;
  for (let index = 0; index < source.length; index += 1) {
    const next = source[(index + 1) % source.length];
    total += source[index].distanceTo(next);
    cumulative.push(total);
  }
  if (total <= 0.000001) return source;

  const result = [];
  for (let sample = 0; sample < targetCount; sample += 1) {
    const distance = (sample / targetCount) * total;
    let segment = 0;
    while (segment + 1 < cumulative.length && cumulative[segment + 1] < distance) {
      segment += 1;
    }
    const start = source[segment % source.length];
    const end = source[(segment + 1) % source.length];
    const segmentStart = cumulative[segment];
    const segmentLength = Math.max(0.000001, cumulative[segment + 1] - segmentStart);
    const amount = THREE.MathUtils.clamp((distance - segmentStart) / segmentLength, 0, 1);
    result.push(start.clone().lerp(end, amount).normalize());
  }
  return result;
}

function insetDirections(base, centre, amount) {
  return base.map((direction) =>
    direction.clone().lerp(centre, amount).normalize(),
  );
}

function pushVertex(positions, colours, direction, radius, colour) {
  const vertex = direction.clone().multiplyScalar(radius);
  positions.push(vertex.x, vertex.y, vertex.z);
  colours.push(colour.r, colour.g, colour.b);
}

function tangentBasis(normal) {
  const helper = Math.abs(normal.y) < 0.86
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const tangentX = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const tangentY = new THREE.Vector3().crossVectors(normal, tangentX).normalize();
  return { tangentX, tangentY };
}

function projectedContour(directions, centreDirection) {
  const { tangentX, tangentY } = tangentBasis(centreDirection);
  return directions.map(
    (direction) => new THREE.Vector2(direction.dot(tangentX), direction.dot(tangentY)),
  );
}

function installReferenceNormals(geometry, ringSize) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;

  const actual = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const blended = new THREE.Vector3();
  // Bevel normals remain physical; top normals progressively follow the sphere.
  const actualWeights = [0.78, 0.86, 0.76, 0.5, 0.22];

  for (let ring = 0; ring < RINGS.length; ring += 1) {
    const weight = actualWeights[ring];
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
  normal.needsUpdate = true;
}

function rebuildAsRaisedPatch(sourceGeometry) {
  const sourcePosition = sourceGeometry.getAttribute('position');
  const sourceColour = sourceGeometry.getAttribute('color');
  if (!sourcePosition || !sourceColour || sourcePosition.count < 18) return null;
  if (sourcePosition.count % 3 !== 0) return null;

  const sourceRingSize = sourcePosition.count / 3;
  const sourceTopStart = sourceRingSize * 2;
  const topColour = ringColour(sourceColour, sourceTopStart, sourceRingSize);

  let base = extractDirections(sourcePosition, 0, sourceRingSize);
  base = resampleClosedDirections(base);
  base = smoothClosedDirections(base);
  const ringSize = base.length;
  const centreDirection = new THREE.Vector3();
  base.forEach((direction) => centreDirection.add(direction));
  centreDirection.normalize();

  const positions = [];
  const colours = [];
  const directionsByRing = RINGS.map((ring) => insetDirections(base, centreDirection, ring.inset));
  RINGS.forEach((ring, ringIndex) => {
    const colour = topColour.clone().offsetHSL(0, ringIndex < 2 ? -0.002 : 0.001, ring.lightness);
    directionsByRing[ringIndex].forEach((direction) => {
      pushVertex(positions, colours, direction, ring.radius, colour);
    });
  });

  const indices = [];
  for (let ring = 0; ring < RINGS.length - 1; ring += 1) {
    const currentStart = ring * ringSize;
    const nextStart = (ring + 1) * ringSize;
    for (let index = 0; index < ringSize; index += 1) {
      const next = (index + 1) % ringSize;
      indices.push(currentStart + index, nextStart + index, currentStart + next);
      indices.push(currentStart + next, nextStart + index, nextStart + next);
    }
  }

  // Correctly triangulate the potentially concave kid-drawn top. A centre fan
  // folds concave gestures into radial wedges; ShapeUtils preserves the actual
  // child contour with no artificial spokes.
  const topDirections = directionsByRing[directionsByRing.length - 1];
  const top2d = projectedContour(topDirections, centreDirection);
  const triangles = THREE.ShapeUtils.triangulateShape(top2d, []);
  const topStart = (RINGS.length - 1) * ringSize;
  triangles.forEach(([a, b, c]) => {
    indices.push(topStart + a, topStart + b, topStart + c);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  installReferenceNormals(geometry, ringSize);
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...sourceGeometry.userData,
    kidsGalaxySculptedKidPatch: true,
    kidsGalaxyBeveledKidPatch: true,
    kidsGalaxyRoundedRaisedKidPatch: true,
    kidsGalaxyReferenceRoundedRelief: true,
    kidsGalaxySmoothSphereFollowingNormals: true,
    kidsGalaxyConcaveTopTriangulation: true,
    kidsGalaxyUniformContourResampling: true,
    kidsGalaxyPatchVertexCount: positions.length / 3,
    kidsGalaxyPatchRelief: RINGS[RINGS.length - 1].radius - BODY_RADIUS,
    kidsGalaxyRaisedPatchRingCount: RINGS.length,
    kidsGalaxyRaisedPatchContourVertices: ringSize,
  };
  return geometry;
}

function tuneMaterial(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.side = THREE.DoubleSide;
  material.shadowSide = THREE.DoubleSide;
  material.roughness = 0.22;
  material.metalness = 0.001;
  material.clearcoat = 0.25;
  material.clearcoatRoughness = 0.28;
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
  material.roughness = 0.3;
  material.clearcoat = 0.15;
  material.clearcoatRoughness = 0.34;
  material.emissive?.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
}

function finishSculptedGroup(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;

  let count = 0;
  let minimumRelief = Number.POSITIVE_INFINITY;
  let minimumContourVertices = Number.POSITIVE_INFINITY;
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
    minimumRelief = Math.min(minimumRelief, replacement.userData.kidsGalaxyPatchRelief);
    minimumContourVertices = Math.min(
      minimumContourVertices,
      replacement.userData.kidsGalaxyRaisedPatchContourVertices,
    );
  });

  if (!count) return false;
  tuneBody(entity.mesh.material);
  group.userData.kidsGalaxyRoundedRaisedReferenceFinish = true;
  group.userData.kidsGalaxyRoundedRaisedPatchCount = count;
  group.userData.kidsGalaxyRoundedRaisedMinimumRelief = minimumRelief;
  group.userData.kidsGalaxyRoundedRaisedMinimumContourVertices = minimumContourVertices;
  entity.mesh.material.userData.kidsGalaxyRoundedRaisedReferenceFinish = true;
  entity.mesh.material.userData.kidsGalaxyRoundedRaisedPatchCount = count;
  entity.mesh.material.userData.kidsGalaxyRoundedRaisedMinimumRelief = minimumRelief;
  return true;
}

/**
 * Final geometry pass: smooth broad bevel + correctly triangulated raised top.
 * This keeps the child's contour while matching the reference molded language.
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
