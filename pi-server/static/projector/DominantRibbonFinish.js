import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const RIBBON_INSETS = [0, 0.012, 0.022, 0.032, 0.042];
const RADIAL_NORMAL_WEIGHTS = [0.36, 0.3, 0.44, 0.7, 0.9];

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

function rebuildCap(geometry, ringCount, ringSize) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute('position');
  if (!index || !position) return false;

  const source = Array.from(index.array);
  const sideIndexCount = (ringCount - 1) * ringSize * 6;
  if (sideIndexCount > source.length) return false;
  const rebuilt = source.slice(0, sideIndexCount);
  const topStart = (ringCount - 1) * ringSize;
  const projected = [];
  for (let index = 0; index < ringSize; index += 1) {
    const vertex = topStart + index;
    projected.push(
      new THREE.Vector2(position.getX(vertex), position.getY(vertex)),
    );
  }

  const triangles = THREE.ShapeUtils.triangulateShape(projected, []);
  triangles.forEach(([a, b, c]) => {
    const va = topStart + a;
    const vb = topStart + b;
    const vc = topStart + c;
    // Both windings are intentional for the cap only. Curving a very concave
    // 2D stroke around the globe can reverse screen-space winding locally; the
    // paired triangle closes that patch while sidewalls remain FrontSide.
    rebuilt.push(va, vb, vc, va, vc, vb);
  });
  geometry.setIndex(rebuilt);
  geometry.userData.kidsGalaxyDominantCapDoubleWound = true;
  geometry.userData.kidsGalaxyDominantCapOriginalTriangles = triangles.length;
  geometry.userData.kidsGalaxyDominantCapClosingTriangles = triangles.length;
  geometry.userData.kidsGalaxyDominantCapRebuiltFromFullWidthContour = true;
  return triangles.length > 0;
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
  const capped = rebuildCap(geometry, ringCount, ringSize);
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

/** Keep long concave same-hue kid strokes solid, broad and low-profile. */
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
