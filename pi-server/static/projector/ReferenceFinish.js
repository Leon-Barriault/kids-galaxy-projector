<<<<<<< HEAD
PLACEHOLDER
=======
import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const TARGET_EDGE_RADIUS = 1.082;
const TARGET_TOP_RADIUS = 1.118;

function effectiveScaleForRadius(mesh, targetRadius) {
  const sourceRadius = Number(mesh?.geometry?.parameters?.radius) || 1;
  return targetRadius / sourceRadius;
}

function tuneClayMaterial(material, { roughness, clearcoat, clearcoatRoughness }) {
  if (!material) return;
  material.roughness = roughness;
  material.metalness = 0.001;
  material.clearcoat = clearcoat;
  material.clearcoatRoughness = clearcoatRoughness;
  if ('sheen' in material) {
    material.sheen = 0.035;
    material.sheenRoughness = 0.72;
    material.sheenColor = new THREE.Color(0xffffff);
  }
  material.needsUpdate = true;
}

function tuneComponentSurface(entity) {
  const body = entity.mesh?.material;
  const edge = entity.accentEdgeMesh?.material;
  const top = entity.accentMesh?.material;
  if (!body?.userData?.kidsGalaxyComponentSurface || !edge || !top) return;

  // Reference objects use broad, saturated studio highlights and stay readable
  // on the shadow side. Lift the kid-derived body very slightly without
  // changing its hue identity.
  body.color.offsetHSL(0, 0.012, 0.028);
  tuneClayMaterial(body, {
    roughness: 0.38,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
  });

  // Keep a real darker same-hue shoulder, but make the top visibly proud of it.
  entity.accentEdgeMesh.scale.setScalar(
    effectiveScaleForRadius(entity.accentEdgeMesh, TARGET_EDGE_RADIUS),
  );
  entity.accentMesh.scale.setScalar(
    effectiveScaleForRadius(entity.accentMesh, TARGET_TOP_RADIUS),
  );

  tuneClayMaterial(edge, {
    roughness: 0.42,
    clearcoat: 0.45,
    clearcoatRoughness: 0.38,
  });
  edge.bumpScale = 0.035;
  edge.alphaTest = 0.035;
  edge.transparent = true;
  edge.opacity = 1;
  edge.depthWrite = true;
  edge.alphaToCoverage = true;

  tuneClayMaterial(top, {
    roughness: 0.34,
    clearcoat: 0.62,
    clearcoatRoughness: 0.28,
  });
  top.bumpScale = 0.055;
  top.displacementScale = 0.014;
  top.displacementBias = -0.0006;
  top.alphaTest = 0.045;
  top.transparent = true;
  top.opacity = 1;
  top.depthWrite = true;
  top.alphaToCoverage = true;

  body.userData.kidsGalaxyReferenceFinish = true;
  body.userData.kidsGalaxyReferenceBodyLift = 0.028;
  edge.userData.kidsGalaxySoftClayEdge = true;
  top.userData.kidsGalaxySoftClayTop = true;
  top.userData.kidsGalaxyReferenceTopRadius = TARGET_TOP_RADIUS;
  edge.userData.kidsGalaxyReferenceEdgeRadius = TARGET_EDGE_RADIUS;
}

function brightenInstanceColours(mesh, lift) {
  if (!mesh?.isInstancedMesh || !mesh.instanceColor) return;
  const colour = new THREE.Color();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getColorAt(index, colour);
    colour.offsetHSL(0, -0.015, lift);
    mesh.setColorAt(index, colour);
  }
  mesh.instanceColor.needsUpdate = true;
}

function shrinkInstances(mesh, factor) {
  if (!mesh?.isInstancedMesh) return;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    scale.multiplyScalar(factor);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function clonePointLayer(layer, rotation, opacityScale) {
  const material = layer.material.clone();
  material.size *= 0.76;
  material.opacity *= opacityScale;
  const clone = new THREE.Points(layer.geometry.clone(), material);
  clone.rotation.z = rotation;
  clone.userData = { ...layer.userData, kidsGalaxyReferenceDensityClone: true };
  clone.userData.particleCount = layer.userData.particleCount || layer.geometry.attributes.position.count;
  clone.frustumCulled = false;
  return clone;
}

function tuneSaturnRing(entity) {
  const ring = entity.decorations?.find(
    (decoration) => decoration.userData?.kidsGalaxySaturnParticleRing,
  );
  if (!ring || ring.userData.kidsGalaxyReferenceRingFinish) return;

  const pointLayers = ring.children.filter(
    (child) => child.isPoints && child.userData?.kidsGalaxySaturnDust,
  );
  const chunks = ring.children.filter((child) => child.isInstancedMesh);

  pointLayers.forEach((layer, index) => {
    // Fine particles should merge optically into Saturn-style bands at normal
    // viewing distance rather than read as a dotted necklace.
    layer.material.size *= index === 0 ? 0.68 : 0.74;
    layer.material.opacity = Math.min(0.88, layer.material.opacity * 1.08);
    layer.material.needsUpdate = true;

    const cloneA = clonePointLayer(layer, 0.017 + index * 0.009, 0.72);
    const cloneB = clonePointLayer(layer, -0.026 - index * 0.011, 0.58);
    ring.add(cloneA, cloneB);
    ring.userData.kidsGalaxyRingParticleCount +=
      (cloneA.userData.particleCount || 0) + (cloneB.userData.particleCount || 0);
  });

  chunks.forEach((chunk) => {
    const rock = chunk.userData?.kidsGalaxyRingParticleKind === 'rock';
    shrinkInstances(chunk, rock ? 0.46 : 0.55);
    brightenInstanceColours(chunk, rock ? 0.13 : 0.07);
    chunk.material.roughness = rock ? 0.72 : 0.58;
    chunk.material.clearcoat = rock ? 0.018 : 0.045;
    chunk.castShadow = false;
    chunk.receiveShadow = false;
    chunk.material.needsUpdate = true;
  });

  ring.userData.kidsGalaxyReferenceRingFinish = true;
  ring.userData.kidsGalaxyUnresolvedParticleBands = true;
  ring.userData.kidsGalaxyVisibleChunkScale = 0.55;
}

/** Final visual acceptance layer for the supplied clay/toy references. */
export function installReferenceFinish() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyReferenceFinish) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;
  const previousAddPlanetRing = PlanetEntity.prototype.addPlanetRing;

  function referenceFinishedTexture(texture) {
    previousApplyTexture.call(this, texture);
    tuneComponentSurface(this);
  }

  function referenceFinishedRing() {
    previousAddPlanetRing.call(this);
    tuneSaturnRing(this);
  }

  referenceFinishedTexture.kidsGalaxyReferenceFinish = true;
  referenceFinishedRing.kidsGalaxyReferenceFinish = true;
  PlanetEntity.prototype.applyTexture = referenceFinishedTexture;
  PlanetEntity.prototype.addPlanetRing = referenceFinishedRing;
}
>>>>>>> d367d7b (fixed from Grok)
