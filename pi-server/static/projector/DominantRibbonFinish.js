import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const RIBBON_INSETS = [0, 0.012, 0.022, 0.032, 0.042];
const RADIAL_NORMAL_WEIGHTS = [0.36, 0.3, 0.44, 0.7, 0.9];
const CAP_SUBDIVISIONS = 2;

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
  const samples = Math.min(48, count);
  for (let index = 0; index < samples; index += 1) {
    const vertex = start + Math.floor((index / samples) * count);
    result.r += colours.getX(vertex);
    result.g += colours.getY(vertex);
    result.b += colours.getZ(vertex);
  }
  return result.multiplyScalar(1 / Math.max(1, samples));
}

function outerDirections(position, ringSize) {
  const directions = [];
  for (let index = 0; index < ringSize; index += 1) {
    directions.push(
      new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index),
      ).normalize(),
    );
  }
  return directions;
}

function centreDirection(directions) {
  const centre = new THREE.Vector3();
  directions.forEach((direction) => centre.add(direction));
  return centre.normalize();
}

function reshapeRings(geometry, ringCount, ringSize) {
  const position = geometry.getAttribute('position');
  if (!position || ringCount !== RIBBON_INSETS.length) return false;

  const outer = outerDirections(position, ringSize);
  const centre = centreDirection(outer);
  const radii = [];
  for (let ring = 0; ring < ringCount; ring += 1) {
    radii.push(averageRadius(position, ring * ringSize, ringSize));
  }

  for (let ring = 0; ring < ringCount; ring += 1) {
    const inset = RIBBON_INSETS[ring];
    const radius = radii[ring];
    for (let index = 0; index < ringSize; index += 1) {
      const direction = outer[index]
        .clone()
        .lerp(centre, inset)
        .normalize()
        .multiplyScalar(radius);
      const vertex = ring * ringSize + index;
      position.setXYZ(vertex, direction.x, direction.y, direction.z);
    }
  }
  position.needsUpdate = true;
  return true;
}

function midpointDirection(a, b) {
  return a.clone().add(b).normalize();
}

function appendLeafTriangle(
  a,
  b,
  c,
  radius,
  colour,
  positions,
  colours,
  indices,
) {
  const directions = [a, b, c];
  const start = positions.length / 3;
  directions.forEach((direction) => {
    const vertex = direction.clone().normalize().multiplyScalar(radius);
    positions.push(vertex.x, vertex.y, vertex.z);
    colours.push(colour.r, colour.g, colour.b);
  });

  const va = directions[0].clone().multiplyScalar(radius);
  const vb = directions[1].clone().multiplyScalar(radius);
  const vc = directions[2].clone().multiplyScalar(radius);
  const normal = vb.clone().sub(va).cross(vc.clone().sub(va));
  const centre = va.clone().add(vb).add(vc).multiplyScalar(1 / 3);
  if (normal.dot(centre) >= 0) indices.push(start, start + 1, start + 2);
  else indices.push(start, start + 2, start + 1);
}

function appendCurvedTriangle(
  a,
  b,
  c,
  depth,
  radius,
  colour,
  positions,
  colours,
  indices,
) {
  if (depth <= 0) {
    appendLeafTriangle(a, b, c, radius, colour, positions, colours, indices);
    return;
  }
  const ab = midpointDirection(a, b);
  const bc = midpointDirection(b, c);
  const ca = midpointDirection(c, a);
  appendCurvedTriangle(a, ab, ca, depth - 1, radius, colour, positions, colours, indices);
  appendCurvedTriangle(ab, b, bc, depth - 1, radius, colour, positions, colours, indices);
  appendCurvedTriangle(ca, bc, c, depth - 1, radius, colour, positions, colours, indices);
  appendCurvedTriangle(ab, bc, ca, depth - 1, radius, colour, positions, colours, indices);
}

function rebuildCurvedCap(geometry, ringCount, ringSize) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  const colourAttribute = geometry.getAttribute('color');
  if (!index || !position || !colourAttribute) return false;

  const sourceIndices = Array.from(index.array);
  const sideIndexCount = (ringCount - 1) * ringSize * 6;
  if (sideIndexCount > sourceIndices.length) return false;

  const topStart = (ringCount - 1) * ringSize;
  const topRadius = averageRadius(position, topStart, ringSize);
  const topColour = averageColour(colourAttribute, topStart, ringSize);
  const projected = [];
  const topDirections = [];
  for (let index = 0; index < ringSize; index += 1) {
    const vertex = topStart + index;
    const direction = new THREE.Vector3(
      position.getX(vertex),
      position.getY(vertex),
      position.getZ(vertex),
    ).normalize();
    topDirections.push(direction);
    projected.push(new THREE.Vector2(direction.x, direction.y));
  }

  const polygonTriangles = THREE.ShapeUtils.triangulateShape(projected, []);
  if (!polygonTriangles.length) return false;

  const positions = Array.from(position.array);
  const colours = Array.from(colourAttribute.array);
  const indices = sourceIndices.slice(0, sideIndexCount);
  const firstCapVertex = positions.length / 3;
  polygonTriangles.forEach(([a, b, c]) => {
    appendCurvedTriangle(
      topDirections[a],
      topDirections[b],
      topDirections[c],
      CAP_SUBDIVISIONS,
      topRadius,
      topColour,
      positions,
      colours,
      indices,
    );
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.userData.kidsGalaxyDominantCurvedCap = true;
  geometry.userData.kidsGalaxyDominantCapSubdivisionDepth = CAP_SUBDIVISIONS;
  geometry.userData.kidsGalaxyDominantCapSourceTriangles = polygonTriangles.length;
  geometry.userData.kidsGalaxyDominantCapFirstVertex = firstCapVertex;
  geometry.userData.kidsGalaxyDominantCapLeafTriangles =
    polygonTriangles.length * 4 ** CAP_SUBDIVISIONS;
  return true;
}

function smoothNormals(geometry, ringCount, ringSize) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!position || !normals) return;

  const geometric = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const blended = new THREE.Vector3();
  for (let ring = 0; ring < ringCount; ring += 1) {
    const radialWeight = RADIAL_NORMAL_WEIGHTS[ring] ?? 0.8;
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

  const capStart = ringCount * ringSize;
  for (let vertex = capStart; vertex < position.count; vertex += 1) {
    radial.fromBufferAttribute(position, vertex).normalize();
    normals.setXYZ(vertex, radial.x, radial.y, radial.z);
  }
  normals.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxyDominantRibbonFullWidthNormals = true;
}

function reshapeRibbon(mesh) {
  const geometry = mesh?.geometry;
  if (!geometry?.userData?.kidsGalaxyDominantGesturePatch) return false;
  if (!geometry.userData.kidsGalaxyRoundedSlab) return false;

  const ringCount = Number(geometry.userData.kidsGalaxyRoundedSlabRingCount) || 0;
  const ringSize = Number(geometry.userData.kidsGalaxyRaisedPatchContourVertices) || 0;
  if (ringCount < 2 || ringSize < 3) return false;

  const reshaped = reshapeRings(geometry, ringCount, ringSize);
  const capped = rebuildCurvedCap(geometry, ringCount, ringSize);
  if (!reshaped || !capped) return false;
  smoothNormals(geometry, ringCount, ringSize);
  geometry.userData.kidsGalaxyDominantRibbonFullWidthFinish = true;
  geometry.userData.kidsGalaxyDominantRibbonMaximumInset =
    Math.max(...RIBBON_INSETS);
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
    colour.offsetHSL(0, 0.055, -0.014);
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
    if (reshapeRibbon(mesh)) closedCount += 1;
    saturateRibbon(mesh);
    mesh.material.side = THREE.FrontSide;
    mesh.material.shadowSide = THREE.FrontSide;
    mesh.material.needsUpdate = true;
  });

  group.userData.kidsGalaxyDominantRibbonFinalCount = ribbonCount;
  group.userData.kidsGalaxyDominantRibbonClosedCapCount = closedCount;
  group.userData.kidsGalaxyDominantRibbonMaximumInset = Math.max(...RIBBON_INSETS);
  entity.mesh.material.userData.kidsGalaxyDominantRibbonFinalCount = ribbonCount;
  entity.mesh.material.userData.kidsGalaxyDominantRibbonClosedCapCount = closedCount;
}

/** Keep long concave same-hue kid strokes solid, broad and curved with the globe. */
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
