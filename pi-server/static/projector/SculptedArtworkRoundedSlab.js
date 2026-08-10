import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const SHOULDER_RELIEF_SCALE = 0.78;
const TOP_RELIEF_SCALE = 0.82;
const INNER_TOP_RISE = 0.0035;
const PLATEAU_RISE = 0.0055;

function averageRadius(position, start, count) {
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

function averageColour(colours, start, count) {
  const result = new THREE.Color();
  const samples = Math.min(32, count);
  for (let index = 0; index < samples; index += 1) {
    const vertex = start + Math.floor((index / samples) * count);
    result.r += colours.getX(vertex);
    result.g += colours.getY(vertex);
    result.b += colours.getZ(vertex);
  }
  return result.multiplyScalar(1 / Math.max(1, samples));
}

function smoothDirections(directions, passes = 4) {
  let current = directions.map((direction) => direction.clone().normalize());
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((direction, index) => {
      const previous = current[(index - 1 + current.length) % current.length];
      const following = current[(index + 1) % current.length];
      return previous
        .clone()
        .multiplyScalar(0.24)
        .add(direction.clone().multiplyScalar(0.52))
        .add(following.clone().multiplyScalar(0.24))
        .normalize();
    });
    current = next;
  }
  return current;
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
  return smoothDirections(result);
}

function centreDirection(directions) {
  const centre = new THREE.Vector3();
  directions.forEach((direction) => centre.add(direction));
  return centre.normalize();
}

function blendRing(directions, centre, amount) {
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

function blendGeometryNormals(geometry, ringSize, ringCount) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!position || !normals) return;
  const geometric = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const blended = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    geometric.fromBufferAttribute(normals, index).normalize();
    radial.fromBufferAttribute(position, index).normalize();
    const ring = Math.min(ringCount - 1, Math.floor(index / ringSize));
    const radialWeight = ring <= 1 ? 0.52 : ring === 2 ? 0.78 : 0.9;
    blended
      .copy(geometric)
      .multiplyScalar(1 - radialWeight)
      .add(radial.clone().multiplyScalar(radialWeight))
      .normalize();
    normals.setXYZ(index, blended.x, blended.y, blended.z);
  }
  normals.needsUpdate = true;
}

function rebuildRoundedSlab(sourceGeometry) {
  const position = sourceGeometry.getAttribute('position');
  const colours = sourceGeometry.getAttribute('color');
  if (!position || !colours || position.count < 18 || position.count % 3 !== 0) return null;

  const ringSize = position.count / 3;
  const outerStart = 0;
  const shoulderStart = ringSize;
  const topStart = ringSize * 2;
  const outerRadius = averageRadius(position, outerStart, ringSize);
  const sourceShoulderRadius = averageRadius(position, shoulderStart, ringSize);
  const sourceTopRadius = averageRadius(position, topStart, ringSize);
  const shoulderRadius = outerRadius +
    (sourceShoulderRadius - outerRadius) * SHOULDER_RELIEF_SCALE;
  const topRadius = outerRadius + (sourceTopRadius - outerRadius) * TOP_RELIEF_SCALE;
  const topColour = averageColour(colours, topStart, ringSize);

  const outerDirections = sourceDirections(position, outerStart, ringSize);
  const shoulderDirections = sourceDirections(position, shoulderStart, ringSize);
  const topDirections = sourceDirections(position, topStart, ringSize);
  const centre = centreDirection(topDirections);
  const innerDirections = blendRing(topDirections, centre, 0.13);
  const plateauDirections = blendRing(topDirections, centre, 0.3);

  const ringDefinitions = [
    {
      directions: outerDirections,
      radius: outerRadius,
      colour: topColour.clone().offsetHSL(0, -0.002, -0.022),
    },
    {
      directions: shoulderDirections,
      radius: shoulderRadius,
      colour: topColour.clone().offsetHSL(0, 0, -0.008),
    },
    {
      directions: topDirections,
      radius: topRadius,
      colour: topColour.clone().offsetHSL(0, 0.005, 0.007),
    },
    {
      directions: innerDirections,
      radius: topRadius + INNER_TOP_RISE,
      colour: topColour.clone().offsetHSL(0, 0.006, 0.011),
    },
    {
      directions: plateauDirections,
      radius: topRadius + PLATEAU_RISE,
      colour: topColour.clone().offsetHSL(0, 0.005, 0.012),
    },
  ];

  const positions = [];
  const vertexColours = [];
  ringDefinitions.forEach(({ directions, radius, colour }) => {
    appendRing(positions, vertexColours, directions, radius, colour);
  });

  const indices = [];
  for (let ring = 0; ring < ringDefinitions.length - 1; ring += 1) {
    const start = ring * ringSize;
    const nextStart = (ring + 1) * ringSize;
    for (let index = 0; index < ringSize; index += 1) {
      const next = (index + 1) % ringSize;
      appendOutwardTriangle(indices, positions, start + index, nextStart + index, start + next);
      appendOutwardTriangle(indices, positions, start + next, nextStart + index, nextStart + next);
    }
  }

  const plateauStart = (ringDefinitions.length - 1) * ringSize;
  const projected = projectedContour(plateauDirections, centre);
  const triangles = THREE.ShapeUtils.triangulateShape(projected, []);
  triangles.forEach(([a, b, c]) => {
    appendOutwardTriangle(
      indices,
      positions,
      plateauStart + a,
      plateauStart + b,
      plateauStart + c,
    );
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColours, 3));
  geometry.setIndex(indices);
  blendGeometryNormals(geometry, ringSize, ringDefinitions.length);
  geometry.computeBoundingSphere();
  geometry.userData = {
    ...sourceGeometry.userData,
    kidsGalaxySculptedKidPatch: true,
    kidsGalaxyBeveledKidPatch: true,
    kidsGalaxyRoundedSlab: true,
    kidsGalaxyBroadPlateau: true,
    kidsGalaxyContourSmoothed: true,
    kidsGalaxyHybridSlabNormals: true,
    kidsGalaxyRoundedSlabRingCount: ringDefinitions.length,
    kidsGalaxyPatchVertexCount: positions.length / 3,
    kidsGalaxyPatchRelief: topRadius + PLATEAU_RISE - outerRadius,
  };
  return geometry;
}

function tuneMaterial(material) {
  if (!material?.isMeshPhysicalMaterial) return;
  material.side = THREE.FrontSide;
  material.shadowSide = THREE.FrontSide;
  material.roughness = 0.41;
  material.metalness = 0.001;
  material.clearcoat = 0.085;
  material.clearcoatRoughness = 0.59;
  material.flatShading = false;
  material.dithering = true;
  material.polygonOffset = false;
  material.needsUpdate = true;
  material.userData.kidsGalaxyRoundedSlabFinish = true;
}

function roundSculptedPieces(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;
  let converted = 0;
  group.children.forEach((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.userData?.kidsGalaxySculptedKidPatch) return;
    const replacement = rebuildRoundedSlab(mesh.geometry);
    if (!replacement) return;
    mesh.geometry.dispose();
    mesh.geometry = replacement;
    tuneMaterial(mesh.material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    converted += 1;
  });
  if (!converted) return false;
  group.userData.kidsGalaxyRoundedSlabFinish = true;
  group.userData.kidsGalaxyRoundedSlabCount = converted;
  group.userData.kidsGalaxyHybridSlabNormals = true;
  entity.mesh.material.userData.kidsGalaxyRoundedSlabFinish = true;
  entity.mesh.material.userData.kidsGalaxyRoundedSlabCount = converted;
  return true;
}

/**
 * Convert broad kid patches into low-profile five-ring slabs. Hybrid normals
 * retain real shoulder lighting while keeping the broad top as smooth as molded
 * clay/plastic instead of revealing polygon triangulation.
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
