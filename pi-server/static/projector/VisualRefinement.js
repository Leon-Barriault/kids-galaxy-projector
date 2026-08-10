import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const FRONT_TARGET_WIDTH = 1.92;
const FRONT_TARGET_HEIGHT = 1.86;
const BACK_TARGET_WIDTH = 1.84;
const BACK_TARGET_HEIGHT = 1.76;
const MAX_GLOBAL_AXIS_SCALE = 1.72;
const MAX_LOCAL_WEIGHT_SCALE = 2.45;
const SPHERE_DISC_LIMIT = 0.985;
const MIN_STROKE_SPAN = 0.165;

function patchMeshes(group, back) {
  return (group?.children || []).filter((child) =>
    child.isMesh &&
    child.geometry?.userData?.kidsGalaxySculptedKidPatch &&
    Boolean(child.userData?.kidsGalaxyBackDesignEcho) === back,
  );
}

function meshBounds(mesh) {
  const position = mesh.geometry?.getAttribute?.('position');
  if (!position?.count) return null;
  const vertex = new THREE.Vector3();
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index).normalize();
    bounds.minX = Math.min(bounds.minX, vertex.x);
    bounds.maxX = Math.max(bounds.maxX, vertex.x);
    bounds.minY = Math.min(bounds.minY, vertex.y);
    bounds.maxY = Math.max(bounds.maxY, vertex.y);
  }
  return Number.isFinite(bounds.minX) ? bounds : null;
}

function combinedBounds(meshes) {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  meshes.forEach((mesh) => {
    const local = meshBounds(mesh);
    if (!local) return;
    bounds.minX = Math.min(bounds.minX, local.minX);
    bounds.maxX = Math.max(bounds.maxX, local.maxX);
    bounds.minY = Math.min(bounds.minY, local.minY);
    bounds.maxY = Math.max(bounds.maxY, local.maxY);
  });
  return Number.isFinite(bounds.minX) ? bounds : null;
}

function span(bounds, axis) {
  return bounds ? bounds[`max${axis}`] - bounds[`min${axis}`] : 0;
}

function reshapeGeometry(geometry, transform) {
  const position = geometry?.getAttribute?.('position');
  if (!position?.count) return;
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const radius = vertex.length();
    if (radius <= 0.000001) continue;
    const direction = vertex.clone().multiplyScalar(1 / radius);
    const sign = direction.z < 0 ? -1 : 1;
    let x = transform.centerX + (direction.x - transform.centerX) * transform.scaleX;
    let y = transform.centerY + (direction.y - transform.centerY) * transform.scaleY;
    const radial = Math.hypot(x, y);
    if (radial > SPHERE_DISC_LIMIT) {
      const clamp = SPHERE_DISC_LIMIT / radial;
      x *= clamp;
      y *= clamp;
    }
    const z = sign * Math.sqrt(Math.max(0.025, 1 - x * x - y * y));
    position.setXYZ(index, x * radius, y * radius, z * radius);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function strengthenThinPatch(mesh) {
  const bounds = meshBounds(mesh);
  if (!bounds) return false;
  const width = span(bounds, 'X');
  const height = span(bounds, 'Y');
  const aspect = width / Math.max(height, 0.001);
  let scaleX = 1;
  let scaleY = 1;

  if (aspect >= 2.0 && height < MIN_STROKE_SPAN) {
    scaleY = THREE.MathUtils.clamp(MIN_STROKE_SPAN / Math.max(height, 0.02), 1, MAX_LOCAL_WEIGHT_SCALE);
  } else if (aspect <= 0.5 && width < MIN_STROKE_SPAN) {
    scaleX = THREE.MathUtils.clamp(MIN_STROKE_SPAN / Math.max(width, 0.02), 1, MAX_LOCAL_WEIGHT_SCALE);
  } else {
    if (width < MIN_STROKE_SPAN * 0.72) {
      scaleX = THREE.MathUtils.clamp((MIN_STROKE_SPAN * 0.72) / Math.max(width, 0.02), 1, 1.8);
    }
    if (height < MIN_STROKE_SPAN * 0.72) {
      scaleY = THREE.MathUtils.clamp((MIN_STROKE_SPAN * 0.72) / Math.max(height, 0.02), 1, 1.8);
    }
  }

  if (scaleX <= 1.01 && scaleY <= 1.01) return false;
  reshapeGeometry(mesh.geometry, {
    centerX: (bounds.minX + bounds.maxX) * 0.5,
    centerY: (bounds.minY + bounds.maxY) * 0.5,
    scaleX,
    scaleY,
  });
  mesh.geometry.userData.kidsGalaxyVisualWeightBoost = true;
  mesh.geometry.userData.kidsGalaxyVisualWeightScaleX = scaleX;
  mesh.geometry.userData.kidsGalaxyVisualWeightScaleY = scaleY;
  return true;
}

function stretchHemisphere(meshes, targetWidth, targetHeight) {
  const bounds = combinedBounds(meshes);
  if (!bounds) return null;
  const width = Math.max(0.08, span(bounds, 'X'));
  const height = Math.max(0.08, span(bounds, 'Y'));
  const scaleX = THREE.MathUtils.clamp(targetWidth / width, 1, MAX_GLOBAL_AXIS_SCALE);
  const scaleY = THREE.MathUtils.clamp(targetHeight / height, 1, MAX_GLOBAL_AXIS_SCALE);
  const transform = {
    centerX: (bounds.minX + bounds.maxX) * 0.5,
    centerY: (bounds.minY + bounds.maxY) * 0.5,
    scaleX,
    scaleY,
  };
  meshes.forEach((mesh) => reshapeGeometry(mesh.geometry, transform));
  return combinedBounds(meshes);
}

function amplifyKidArtwork(entity) {
  const group = entity.sculptedArtworkGroup;
  if (!group?.userData?.kidsGalaxySculptedArtworkGroup) return false;
  const front = patchMeshes(group, false);
  const back = patchMeshes(group, true);
  if (!front.length) return false;

  let weighted = 0;
  [...front, ...back].forEach((mesh) => {
    if (strengthenThinPatch(mesh)) weighted += 1;
  });

  const frontBounds = stretchHemisphere(front, FRONT_TARGET_WIDTH, FRONT_TARGET_HEIGHT);
  const backBounds = back.length
    ? stretchHemisphere(back, BACK_TARGET_WIDTH, BACK_TARGET_HEIGHT)
    : null;

  const data = entity.mesh.material.userData;
  data.kidsGalaxyAggressiveArtworkCoverage = true;
  data.kidsGalaxyArtworkVisualWeightBoosts = weighted;
  data.kidsGalaxyAmplifiedFrontWidth = span(frontBounds, 'X');
  data.kidsGalaxyAmplifiedFrontHeight = span(frontBounds, 'Y');
  data.kidsGalaxyAmplifiedBackWidth = span(backBounds, 'X');
  data.kidsGalaxyAmplifiedBackHeight = span(backBounds, 'Y');
  group.userData.kidsGalaxyAggressiveArtworkCoverage = true;
  group.userData.kidsGalaxyArtworkVisualWeightBoosts = weighted;
  return true;
}

function boostedCraterDefinitions(previous) {
  return function deeperCraterDefinitions() {
    return previous.call(this).map((definition) => ({
      ...definition,
      depth: definition.depth * 1.36,
      rimHeight: definition.rimHeight ? definition.rimHeight * 1.28 : definition.rimHeight,
      rimRadius: definition.rimRadius ? definition.rimRadius * 1.08 : definition.rimRadius,
    }));
  };
}

function tuneCraterMaterials(entity) {
  if (entity.style !== 'cratered') return;
  entity.mesh.children.forEach((child) => {
    if (!child.userData?.kidsGalaxyCrater) return;
    child.children.forEach((part) => {
      if (!part.material?.color) return;
      if (part.geometry?.userData?.kidsGalaxyCraterBowl) {
        part.material.color.offsetHSL(0, -0.015, -0.085);
        part.material.roughness = 0.8;
        part.material.clearcoat = 0.025;
      } else if (part.geometry?.userData?.kidsGalaxyCraterRim) {
        part.material.color.offsetHSL(0, -0.01, 0.035);
        part.material.roughness = 0.54;
      }
      part.material.needsUpdate = true;
    });
  });
}

function detailedAstronaut() {
  const group = new THREE.Group();
  group.userData.kidsGalaxyDetailedAstronaut = true;

  const suit = new THREE.MeshPhysicalMaterial({
    color: 0xf3f6fb,
    roughness: 0.46,
    metalness: 0.03,
    clearcoat: 0.16,
    clearcoatRoughness: 0.7,
  });
  const joint = new THREE.MeshStandardMaterial({ color: 0xc8d0db, roughness: 0.58, metalness: 0.08 });
  const visor = new THREE.MeshPhysicalMaterial({
    color: 0x16314f,
    roughness: 0.12,
    metalness: 0.42,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303a49, roughness: 0.5, metalness: 0.18 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe85b47, roughness: 0.48, metalness: 0.03 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x6ba9d6, roughness: 0.38, metalness: 0.12 });

  const add = (geometry, material, position, scale = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  add(new THREE.SphereGeometry(0.145, 28, 22), suit, [0, 0.245, 0]);
  add(new THREE.SphereGeometry(0.108, 28, 20, 0, Math.PI * 2, 0.18, Math.PI * 0.72), visor, [0, 0.248, 0.076], [1, 0.92, 0.62]);
  add(new THREE.TorusGeometry(0.112, 0.012, 8, 28), joint, [0, 0.245, 0.086], [1, 0.92, 1]).rotation.x = Math.PI / 2;

  add(new THREE.BoxGeometry(0.21, 0.245, 0.13), suit, [0, 0.045, 0]);
  add(new THREE.BoxGeometry(0.16, 0.11, 0.075), joint, [0, 0.055, -0.09]);
  add(new THREE.BoxGeometry(0.125, 0.07, 0.018), dark, [0, 0.08, 0.076]);
  add(new THREE.BoxGeometry(0.095, 0.043, 0.02), panel, [0, 0.09, 0.088]);
  add(new THREE.BoxGeometry(0.026, 0.02, 0.022), accent, [-0.034, 0.09, 0.101]);
  add(new THREE.BoxGeometry(0.026, 0.02, 0.022), panel, [0.034, 0.09, 0.101]);
  add(new THREE.BoxGeometry(0.215, 0.027, 0.145), dark, [0, -0.065, 0]);

  const makeLimb = (side) => {
    const shoulder = add(new THREE.SphereGeometry(0.045, 14, 10), joint, [side * 0.135, 0.115, 0]);
    const upper = add(new THREE.CapsuleGeometry(0.036, 0.115, 5, 10), suit, [side * 0.17, 0.055, 0]);
    upper.rotation.z = side * -0.52;
    const elbow = add(new THREE.SphereGeometry(0.038, 14, 10), joint, [side * 0.205, -0.005, 0]);
    const forearm = add(new THREE.CapsuleGeometry(0.031, 0.1, 5, 10), suit, [side * 0.218, -0.067, 0.01]);
    forearm.rotation.z = side * 0.18;
    add(new THREE.SphereGeometry(0.04, 14, 10), suit, [side * 0.225, -0.132, 0.018]);
    shoulder.userData.kidsGalaxyAstronautJoint = true;
    elbow.userData.kidsGalaxyAstronautJoint = true;
  };
  makeLimb(-1);
  makeLimb(1);

  const makeLeg = (side) => {
    const hip = add(new THREE.SphereGeometry(0.043, 14, 10), joint, [side * 0.062, -0.095, 0]);
    const thigh = add(new THREE.CapsuleGeometry(0.038, 0.105, 5, 10), suit, [side * 0.07, -0.165, 0]);
    thigh.rotation.z = side * 0.09;
    add(new THREE.SphereGeometry(0.038, 14, 10), joint, [side * 0.078, -0.235, 0]);
    const shin = add(new THREE.CapsuleGeometry(0.034, 0.095, 5, 10), suit, [side * 0.083, -0.298, 0.008]);
    shin.rotation.z = side * -0.06;
    const boot = add(new THREE.BoxGeometry(0.075, 0.055, 0.105), dark, [side * 0.086, -0.37, 0.025]);
    boot.rotation.x = -0.12;
    hip.userData.kidsGalaxyAstronautJoint = true;
  };
  makeLeg(-1);
  makeLeg(1);

  add(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 8), accent, [0.115, 0.02, -0.08]).rotation.z = 0.2;
  group.scale.setScalar(0.88);
  group.rotation.z = -0.08;
  return group;
}

/** Final projector polish: stronger kid-art coverage, deeper craters, richer astronaut. */
export function installVisualRefinement() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyVisualRefinement) return;

  const previousApplyTexture = PlanetEntity.prototype.applyTexture;
  const previousCraterDefinitions = PlanetEntity.prototype.craterDefinitions;
  const previousAddCraterDetails = PlanetEntity.prototype.addCraterDetails;

  PlanetEntity.prototype.craterDefinitions = boostedCraterDefinitions(previousCraterDefinitions);
  PlanetEntity.prototype.addCraterDetails = function refinedCraterDetails() {
    previousAddCraterDetails.call(this);
    tuneCraterMaterials(this);
  };
  PlanetEntity.prototype.createAstronaut = detailedAstronaut;

  function refinedTexture(texture) {
    previousApplyTexture.call(this, texture);
    amplifyKidArtwork(this);
  }
  refinedTexture.kidsGalaxyVisualRefinement = true;
  PlanetEntity.prototype.applyTexture = refinedTexture;
}
