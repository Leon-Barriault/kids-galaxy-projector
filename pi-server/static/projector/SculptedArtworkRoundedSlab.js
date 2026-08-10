import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const BODY_RADIUS = 1.056;
const RINGS = [
  { inset: 0.0, radius: 1.058, lightness: -0.08 },
  { inset: 0.04, radius: 1.075, lightness: -0.045 },
  { inset: 0.08, radius: 1.096, lightness: -0.02 },
  { inset: 0.12, radius: 1.114, lightness: 0.0 },
  { inset: 0.15, radius: 1.124, lightness: 0.012 },
];

function averageColour(colours, start, count) {
  const result = new THREE.Color();
  const samples = Math.min(48, count);
  for (let index = 0; index < samples; index += 1) {
    const vertex = start + Math.floor((index / samples) * count);
    result.r += colours.getX(vertex);
    result.g += colours.getY(vertex);
    result.b += colours.getZ(vertex);
  }
  return result.multiplyScalar(1 / Math.max(1, samples));
}

function sourceDirections(position, start, count) {
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const vertex = start + index;
    result.push(
      new THREE.Vector3(
        position.getX(vertex),
        position.getY(vertex),
        position.getZ(vertex),
      ).normalize(),
    );
  }
  return result;
}

function resampleClosedDirections(input) {
  const source = input.map((direction) => direction.clone().normalize());
  const targetCount = THREE.MathUtils.clamp(source.length * 3, 48, 128);
  const cumulative = [0];
  let total = 0;
  for (let index = 0; index < source.length; index += 1) {
    total += source[index].distanceTo(source[(index + 1) % source.length]);
    cumulative.push(total);
  }
  if (total <= 0.000001) return source;

  const result = [];
  for (let sample = 0; sample < targetCount; sample += 1) {
    const distance = (sample / targetCount) * total;
    let segment = 0;
    while (
      segment + 1 < cumulative.length &&
      cumulative[segment + 1] < distance
    ) {
      segment += 1;
    }
    const start = source[segment % source.length];
    const end = source[(segment + 1) % source.length];
    const segmentStart = cumulative[segment];
    const segmentLength = Math.max(
      0.000001,
      cumulative[segment + 1] - segmentStart,
    );
    const amount = THREE.MathUtils.clamp(
      (distance - segmentStart) / segmentLength,
      0,
      1,
    );
    result.push(start.clone().lerp(end, amount).normalize());
  }
  return result;
}

function smoothDirections(directions, passes = 3) {
  let current = directions.map((direction) => direction.clone().normalize());
  for (let pass = 0; pass < passes; pass += 1) {
    const previousPass = current;
    current = previousPass.map((direction, index) => {
      const previous = previousPass[(index - 1 + previousPass.length) % previousPass.length];
      const following = previousPass[(index + 1) % previousPass.length];
      return previous
        .clone()
        .multiplyScalar(0.18)
        .add(direction.clone().multiplyScalar(0.64))
        .add(following.clone().multiplyScalar(0.18))
        .normalize();
    });
  }
  return current;
}

function centreDirection(directions) {
  const centre = new THREE.Vector3();
  directions.forEach((direction) => centre.add(direction));
  return centre.normalize();
}

function insetRing(directions, centre, amount) {
  return directions.map((direction) =>
    direction.clone().lerp(centre, amount).normalize(),
  );
}

function tangentBasis(centre) {
  const helper = Math.abs(centre.y) < 0.86
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(helper, centre).normalize();
  const v = new THREE.Vector3().crossVectors(centre, u).normalize();
  return { u, v };
}

function projectedContour(directions, centre) {
  const { u, v } = tangentBasis(centre);
  return directions.map(
    (direction) => new THREE.Vector2(direction.dot(u), direction.dot(v)),
  );
}

function appendRing(positions, colours, directions, radius, colour) {
  directions.forEach((direction) => {
    const vertex = direction.clone().multiplyScalar(radius);
    positions.push(vertex.x, vertex.y, vertex.z);
    colours.push(colour.r, colour.g, colour.b);
  });
}

function vectorAt(positions, index) {
  return new THREE.Vector3(
    positions[index * 3],
    positions[index * 3 + 1],
    positions[index * 3 + 2],
  );
}

function appendOutwardTriangle(indices, positions, a, b, c) {
  const va = vectorAt(positions, a);
  const vb = vectorAt(positions, b);
  const vc = vectorAt(positions, c);
  const normal = vb.clone().sub(va).cross(vc.clone().sub(va));
  const centre = va.clone().add(vb).add(vc).multiplyScalar(1 / 3);
  if (normal.dot(centre) >= 0) indices.push(a, b, c);
  else indices.push(a, c, b);
}

function blendGeometryNormals(geometry, ringSize) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!position || !normals) return;
  const geometric = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const blended = new THREE.Vector3();
  // The first three rings show the real rounded shoulder; the broad top becomes
  // progressively sphere-following so it reads like molded clay/plastic rather
  // than a faceted button.
  const radialWeights = [0.14, 0.1, 0.2, 0.45, 0.8];

  for (let ring = 0; ring < RINGS.length; ring += 1) {
    const radialWeight = radialWeights[ring];
    for (let index = 0; index < ringSize; index += 1) {
      const vertex = ring * ringSize + index;
      geometric.fromBufferAttribute(normals, vertex).normalize();
      radial.fromBufferAttribute(position, vertex).normalize();
      blended
        .copy(geometric)
        .multiplyScalar(1 - radialWeight)
        .addScaledVector(radial, radialWeight)
        .normalize();
      normals.setXYZ(vertex, blended.x, blended.y, blended.z);
    }
  }
  normals.needsUpdate = true;
}

function rebuildRoundedSlab(sourceGeometry) {
  const position = sourceGeometry.getAttribute('position');
  const colours = sourceGeometry.getAttribute('color');
  if (!position || !colours || position.count < 18 || position.count % 3 !== 0) {
    return null;
  }

  const sourceRingSize = position.count / 3;
  const sourceTopStart = sourceRingSize * 2;
  const topColour = averageColour(colours, sourceTopStart, sourceRingSize);

  let outerDirections = sourceDirections(position, 0, sourceRingSize);
  outerDirections = resampleClosedDirections(outerDirections);
  outerDirections = smoothDirections(outerDirections);
  const ringSize = outerDirections.length;
  const centre = centreDirection(outerDirections);
  const directionsByRing = RINGS.map((ring) =>
    insetRing(outerDirections, centre, ring.inset),
  );

  const positions = [];
  const vertexColours = [];
  RINGS.forEach((ring, ringIndex) => {
    const colour = topColour.clone().offsetHSL(
      0,
      ringIndex < 2 ? -0.003 : 0.001,
      ring.lightness,
    );
    appendRing(
      positions,
      vertexColours,
      directionsByRing[ringIndex],
      ring.radius,
      colour,
    );
  });

  const indices = [];
  for (let ring = 0; ring < RINGS.length - 1; ring += 1) {
    const start = ring * ringSize;
    const nextStart = (ring + 1) * ringSize;
    for (let index = 0; index < ringSize; index += 1) {
      const next = (index + 1) % ringSize;
      appendOutwardTriangle(
        indices,
        positions,
        start + index,
        nextStart + index,
        start + next,
      );
      appendOutwardTriangle(
        indices,
        positions,
        start + next,
        nextStart + index,
        nextStart + next,
      );
    }
  }

  // Keep concave child strokes as concave strokes. A centre fan creates false
  // radial wedges; ShapeUtils triangulates the actual smoothed kid contour.
  const topDirections = directionsByRing[directionsByRing.length - 1];
  const topStart = (RINGS.length - 1) * ringSize;
  const projected = projectedContour(topDirections, centre);
  const triangles = THREE.ShapeUtils.triangulateShape(projected, []);
  triangles.forEach(([a, b, c]) => {
    appendOutwardTriangle(
      indices,
      positions,
      topStart + a,
      topStart + b,
      topStart + c,
    );
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(vertexColours, 3),
  );
  geometry.setIndex(indices);
  blendGeometryNormals(geometry, ringSize);
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...sourceGeometry.userData,
    kidsGalaxySculptedKidPatch: true,
    kidsGalaxyBeveledKidPatch: true,
    kidsGalaxyRoundedSlab: true,
    kidsGalaxyBroadPlateau: true,
    kidsGalaxyContourSmoothed: true,
    kidsGalaxyUniformContourResampling: true,
    kidsGalaxyConcaveTopTriangulation: true,
    kidsGalaxyVisibleRoundedBevel: true,
    kidsGalaxyHybridSlabNormals: true,
    kidsGalaxyRoundedSlabRingCount: RINGS.length,
    kidsGalaxyRaisedPatchContourVertices: ringSize,
    kidsGalaxyPatchVertexCount: positions.length / 3,
    kidsGalaxyPatchRelief: RINGS[RINGS.length - 1].radius - BODY_RADIUS,
  };
  return geometry;
}

function tuneMaterial(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.side = THREE.FrontSide;
  material.shadowSide = THREE.FrontSide;
  material.roughness = 0.23;
  material.metalness = 0.001;
  material.clearcoat = 0.24;
  material.clearcoatRoughness = 0.29;
  material.flatShading = false;
  material.dithering = true;
  material.polygonOffset = false;
  material.emissive?.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
  material.userData.kidsGalaxyRoundedSlabFinish = true;
  material.userData.kidsGalaxyVisibleRoundedBevel = true;
}

function roundSculptedPieces(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;
  let converted = 0;
  let minimumContourVertices = Number.POSITIVE_INFINITY;
  group.children.forEach((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.userData?.kidsGalaxySculptedKidPatch) {
      return;
    }
    const replacement = rebuildRoundedSlab(mesh.geometry);
    if (!replacement) return;
    mesh.geometry.dispose();
    mesh.geometry = replacement;
    tuneMaterial(mesh.material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    converted += 1;
    minimumContourVertices = Math.min(
      minimumContourVertices,
      replacement.userData.kidsGalaxyRaisedPatchContourVertices,
    );
  });
  if (!converted) return false;

  if (entity.mesh.material?.isMeshPhysicalMaterial) {
    entity.mesh.material.roughness = 0.3;
    entity.mesh.material.clearcoat = 0.15;
    entity.mesh.material.clearcoatRoughness = 0.34;
    entity.mesh.material.needsUpdate = true;
  }

  group.userData.kidsGalaxyRoundedSlabFinish = true;
  group.userData.kidsGalaxyRoundedSlabCount = converted;
  group.userData.kidsGalaxyVisibleRoundedBevel = true;
  group.userData.kidsGalaxyUniformContourResampling = true;
  group.userData.kidsGalaxyRoundedSlabMinimumContourVertices = minimumContourVertices;
  entity.mesh.material.userData.kidsGalaxyRoundedSlabFinish = true;
  entity.mesh.material.userData.kidsGalaxyRoundedSlabCount = converted;
  entity.mesh.material.userData.kidsGalaxyVisibleRoundedBevel = true;
  return true;
}

/**
 * Final production finish: smooth, broad, same-hue raised slabs with a rounded
 * bevel and a sphere-following top, driven directly by the child's contours.
 */
export function installSculptedArtworkRoundedSlab() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyRoundedSlab) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function roundedSlabTexture(texture) {
    previousApplyTexture.call(this, texture);
    roundSculptedPieces(this);
  }

  roundedSlabTexture.kidsGalaxyRoundedSlab = true;
  PlanetEntity.prototype.applyTexture = roundedSlabTexture;
}
