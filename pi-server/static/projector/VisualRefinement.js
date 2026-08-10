import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const FRONT_TARGET_WIDTH = 1.78;
const FRONT_TARGET_HEIGHT = 1.72;
const BACK_TARGET_WIDTH = 1.72;
const BACK_TARGET_HEIGHT = 1.66;
const MAX_GLOBAL_AXIS_SCALE = 1.48;
const MAX_LOCAL_WEIGHT_SCALE = 2.05;
const SPHERE_DISC_LIMIT = 0.97;
const MIN_STROKE_SPAN = 0.15;

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
  group.userData.kidsGalaxyFullVisorAstronaut = true;

  const suit = new THREE.MeshPhysicalMaterial({
    color: 0xf6f8fc,
    roughness: 0.5,
    metalness: 0.02,
    clearcoat: 0.13,
    clearcoatRoughness: 0.72,
  });
  const joint = new THREE.MeshStandardMaterial({ color: 0xd6dde7, roughness: 0.62, metalness: 0.05 });
  const visor = new THREE.MeshPhysicalMaterial({
    color: 0x173c63,
    roughness: 0.08,
    metalness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const visorHighlight = new THREE.MeshPhysicalMaterial({
    color: 0x8edcff,
    roughness: 0.1,
    metalness: 0.08,
    clearcoat: 0.8,
    clearcoatRoughness: 0.08,
  });
  const boot = new THREE.MeshStandardMaterial({ color: 0xaab7c8, roughness: 0.62, metalness: 0.08 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x62c7ff, roughness: 0.44, metalness: 0.03 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x5b86b5, roughness: 0.42, metalness: 0.08 });

  const add = (geometry, material, position, scale = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  add(new THREE.SphereGeometry(0.16, 32, 24), suit, [0, 0.245, 0]);
  add(new THREE.SphereGeometry(0.128, 32, 24), visor, [0, 0.248, 0.086], [1.04, 0.8, 0.58]);
  add(new THREE.BoxGeometry(0.105, 0.013, 0.012), visorHighlight, [-0.012, 0.292, 0.155]).rotation.z = -0.08;
  add(new THREE.TorusGeometry(0.13, 0.009, 10, 32), joint, [0, 0.242, 0.091], [1.04, 0.82, 1]).rotation.x = Math.PI / 2;

  add(new THREE.CapsuleGeometry(0.092, 0.135, 7, 16), suit, [0, 0.035, 0]);
  add(new THREE.BoxGeometry(0.145, 0.11, 0.07), joint, [0, 0.04, -0.09]);
  add(new THREE.BoxGeometry(0.112, 0.055, 0.018), panel, [0, 0.075, 0.086]);
  add(new THREE.BoxGeometry(0.032, 0.016, 0.019), accent, [-0.032, 0.075, 0.099]);
  add(new THREE.BoxGeometry(0.032, 0.016, 0.019), visorHighlight, [0.032, 0.075, 0.099]);
  add(new THREE.BoxGeometry(0.185, 0.023, 0.13), boot, [0, -0.055, 0]);

  const makeLimb = (side) => {
    const shoulder = add(new THREE.SphereGeometry(0.045, 16, 12), joint, [side * 0.122, 0.105, 0]);
    const upper = add(new THREE.CapsuleGeometry(0.034, 0.105, 6, 12), suit, [side * 0.158, 0.052, 0.008]);
    upper.rotation.z = side * -0.4;
    const elbow = add(new THREE.SphereGeometry(0.036, 16, 12), joint, [side * 0.187, 0.002, 0.012]);
    const forearm = add(new THREE.CapsuleGeometry(0.03, 0.09, 6, 12), suit, [side * 0.196, -0.052, 0.02]);
    forearm.rotation.z = side * 0.1;
    add(new THREE.SphereGeometry(0.038, 16, 12), suit, [side * 0.2, -0.112, 0.025]);
    shoulder.userData.kidsGalaxyAstronautJoint = true;
    elbow.userData.kidsGalaxyAstronautJoint = true;
  };
  makeLimb(-1);
  makeLimb(1);

  const makeLeg = (side) => {
    const hip = add(new THREE.SphereGeometry(0.042, 16, 12), joint, [side * 0.056, -0.088, 0]);
    const thigh = add(new THREE.CapsuleGeometry(0.037, 0.095, 6, 12), suit, [side * 0.062, -0.15, 0]);
    thigh.rotation.z = side * 0.055;
    add(new THREE.SphereGeometry(0.035, 16, 12), joint, [side * 0.068, -0.214, 0]);
    const shin = add(new THREE.CapsuleGeometry(0.032, 0.085, 6, 12), suit, [side * 0.073, -0.27, 0.008]);
    shin.rotation.z = side * -0.035;
    const foot = add(new THREE.BoxGeometry(0.07, 0.052, 0.095), boot, [side * 0.075, -0.334, 0.022]);
    foot.rotation.x = -0.08;
    hip.userData.kidsGalaxyAstronautJoint = true;
  };
  makeLeg(-1);
  makeLeg(1);

  group.scale.setScalar(0.86);
  group.rotation.z = -0.045;
  return group;
}

/** Final projector polish: balanced kid-art coverage, deeper craters, friendly astronaut. */
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
