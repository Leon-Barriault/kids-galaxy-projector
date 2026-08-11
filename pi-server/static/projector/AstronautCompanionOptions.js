import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

export const ASTRONAUT_VARIANTS = Object.freeze([
  Object.freeze({ id: 1, key: 'bubble-buddy', label: 'Bubble Buddy' }),
  Object.freeze({ id: 2, key: 'star-hopper', label: 'Star Hopper' }),
  Object.freeze({ id: 3, key: 'cozy-dreamer', label: 'Cozy Dreamer' }),
]);

const VARIANT_ALIASES = new Map([
  ['1', 1],
  ['bubble', 1],
  ['buddy', 1],
  ['bubble-buddy', 1],
  ['2', 2],
  ['star', 2],
  ['hopper', 2],
  ['star-hopper', 2],
  ['3', 3],
  ['cozy', 3],
  ['dreamer', 3],
  ['cozy-dreamer', 3],
]);

function physicalMaterial(color, overrides = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.54,
    metalness: 0.015,
    clearcoat: 0.08,
    clearcoatRoughness: 0.72,
    ...overrides,
  });
}

function standardMaterial(color, overrides = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.025,
    ...overrides,
  });
}

function addMesh(group, geometry, material, position, scale = null, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function starGeometry(outerRadius = 0.04, innerRadius = outerRadius * 0.48) {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function markVisor(mesh, tone) {
  mesh.userData.kidsGalaxyAstronautVisor = true;
  mesh.userData.kidsGalaxyAstronautVisorTone = tone;
  mesh.userData.kidsGalaxyBrightKidFriendlyVisor = true;
  return mesh;
}

function addFriendlyFace(group, y, z, color = 0x31546f, eyeSpacing = 0.034, scale = 1) {
  const face = standardMaterial(color, { roughness: 0.5, metalness: 0 });
  addMesh(
    group,
    new THREE.SphereGeometry(0.012 * scale, 12, 10),
    face,
    [-eyeSpacing, y + 0.014 * scale, z],
    [1, 1.15, 0.42],
  );
  addMesh(
    group,
    new THREE.SphereGeometry(0.012 * scale, 12, 10),
    face,
    [eyeSpacing, y + 0.014 * scale, z],
    [1, 1.15, 0.42],
  );
  const smile = addMesh(
    group,
    new THREE.TorusGeometry(0.03 * scale, 0.0055 * scale, 8, 20, Math.PI),
    face,
    [0, y - 0.014 * scale, z + 0.001],
  );
  smile.rotation.z = Math.PI;
  return smile;
}

function finishVariant(group, variant, scale = 1) {
  group.scale.setScalar(scale);
  group.userData.kidsGalaxyFriendlyAstronaut = true;
  group.userData.kidsGalaxyAstronautVariantNumber = variant.id;
  group.userData.kidsGalaxyAstronautVariant = variant.key;
  group.userData.kidsGalaxyAstronautVariantLabel = variant.label;
  group.userData.kidsGalaxyAstronautPreviewQuery = `astronaut=${variant.id}`;
  return group;
}

function bubbleBuddy() {
  const group = new THREE.Group();
  const suit = physicalMaterial(0xfffbef);
  const trim = standardMaterial(0x70cde6);
  const warm = standardMaterial(0xffc85c);
  const visor = physicalMaterial(0xbdefff, {
    roughness: 0.22,
    clearcoat: 0.42,
    clearcoatRoughness: 0.2,
  });
  const sole = standardMaterial(0x8cb7c9);

  addMesh(group, new THREE.SphereGeometry(0.178, 32, 24), suit, [0, 0.205, 0]);
  const visorMesh = addMesh(
    group,
    new THREE.SphereGeometry(0.137, 28, 22),
    visor,
    [0, 0.208, 0.103],
    [1.03, 0.82, 0.52],
  );
  markVisor(visorMesh, 'sky-blue');
  addMesh(
    group,
    new THREE.TorusGeometry(0.139, 0.008, 10, 32),
    trim,
    [0, 0.205, 0.105],
    [1.02, 0.84, 1],
    [Math.PI / 2, 0, 0],
  );
  addFriendlyFace(group, 0.205, 0.171, 0x36566b, 0.034, 1.02);

  addMesh(group, new THREE.CapsuleGeometry(0.094, 0.112, 7, 16), suit, [0, 0.005, 0]);
  addMesh(group, new THREE.TorusGeometry(0.09, 0.011, 8, 24), trim, [0, 0.083, 0.012], [1, 1, 0.72], [Math.PI / 2, 0, 0]);
  addMesh(group, starGeometry(0.039), warm, [0, 0.026, 0.099]);

  const wavingArm = addMesh(
    group,
    new THREE.CapsuleGeometry(0.032, 0.105, 6, 12),
    suit,
    [-0.142, 0.073, 0.004],
  );
  wavingArm.rotation.z = 0.72;
  addMesh(group, new THREE.SphereGeometry(0.038, 14, 12), suit, [-0.187, 0.135, 0.008]);
  const calmArm = addMesh(
    group,
    new THREE.CapsuleGeometry(0.031, 0.095, 6, 12),
    suit,
    [0.137, 0.02, 0.005],
  );
  calmArm.rotation.z = -0.2;
  addMesh(group, new THREE.SphereGeometry(0.036, 14, 12), suit, [0.148, -0.045, 0.01]);

  [-1, 1].forEach((side) => {
    addMesh(group, new THREE.CapsuleGeometry(0.035, 0.07, 5, 12), suit, [side * 0.054, -0.13, 0]);
    addMesh(group, new THREE.BoxGeometry(0.072, 0.042, 0.09), sole, [side * 0.057, -0.205, 0.025]);
  });
  addMesh(group, new THREE.BoxGeometry(0.105, 0.1, 0.055), trim, [0, 0.025, -0.087]);

  group.rotation.z = -0.04;
  return finishVariant(group, ASTRONAUT_VARIANTS[0], 0.88);
}

function starHopper() {
  const group = new THREE.Group();
  const suit = physicalMaterial(0xfff8f3);
  const trim = standardMaterial(0xa999e8);
  const teal = standardMaterial(0x55c9bd);
  const warm = standardMaterial(0xffd368);
  const visor = physicalMaterial(0xe1d8ff, {
    roughness: 0.24,
    clearcoat: 0.38,
    clearcoatRoughness: 0.22,
  });

  addMesh(group, new THREE.SphereGeometry(0.182, 32, 24), suit, [0, 0.208, 0]);
  const visorMesh = addMesh(
    group,
    new THREE.SphereGeometry(0.141, 28, 22),
    visor,
    [0, 0.211, 0.104],
    [1.05, 0.83, 0.5],
  );
  markVisor(visorMesh, 'soft-lavender');
  addMesh(
    group,
    new THREE.TorusGeometry(0.143, 0.009, 10, 32),
    trim,
    [0, 0.208, 0.107],
    [1.03, 0.85, 1],
    [Math.PI / 2, 0, 0],
  );
  addFriendlyFace(group, 0.208, 0.174, 0x514c72, 0.036, 1.04);

  addMesh(group, new THREE.SphereGeometry(0.112, 24, 18), suit, [0, -0.004, 0], [1, 1.08, 0.9]);
  addMesh(group, new THREE.TorusGeometry(0.105, 0.012, 8, 24), trim, [0, 0.035, 0.002], [1, 1, 0.76], [Math.PI / 2, 0, 0]);
  addMesh(group, starGeometry(0.043), teal, [0, 0.006, 0.105]);

  [-1, 1].forEach((side) => {
    const arm = addMesh(
      group,
      new THREE.CapsuleGeometry(0.031, 0.105, 6, 12),
      suit,
      [side * 0.143, 0.055, 0.006],
    );
    arm.rotation.z = side * -0.62;
    addMesh(group, new THREE.SphereGeometry(0.037, 14, 12), suit, [side * 0.188, 0.12, 0.012]);
    addMesh(group, new THREE.SphereGeometry(0.014, 10, 8), warm, [side * 0.201, 0.14, 0.038]);
  });

  [-1, 1].forEach((side) => {
    const leg = addMesh(
      group,
      new THREE.CapsuleGeometry(0.034, 0.07, 5, 12),
      suit,
      [side * 0.057, -0.132, 0.005],
    );
    leg.rotation.z = side * -0.13;
    const boot = addMesh(
      group,
      new THREE.BoxGeometry(0.071, 0.042, 0.09),
      teal,
      [side * 0.063, -0.204, 0.033],
    );
    boot.rotation.z = side * -0.08;
  });
  addMesh(group, new THREE.BoxGeometry(0.12, 0.105, 0.06), trim, [0, 0.012, -0.09]);

  group.rotation.z = 0.035;
  return finishVariant(group, ASTRONAUT_VARIANTS[1], 0.87);
}

function cozyDreamer() {
  const group = new THREE.Group();
  const suit = physicalMaterial(0xf5fff8);
  const trim = standardMaterial(0x79c9aa);
  const warm = standardMaterial(0xf1c76b);
  const visor = physicalMaterial(0xffe7ad, {
    roughness: 0.3,
    clearcoat: 0.3,
    clearcoatRoughness: 0.28,
  });
  const boot = standardMaterial(0x91b8a7);

  addMesh(group, new THREE.SphereGeometry(0.184, 32, 24), suit, [0, 0.205, 0]);
  const visorMesh = addMesh(
    group,
    new THREE.SphereGeometry(0.143, 28, 22),
    visor,
    [0, 0.207, 0.103],
    [1.05, 0.84, 0.5],
  );
  markVisor(visorMesh, 'warm-gold');
  addMesh(
    group,
    new THREE.TorusGeometry(0.145, 0.009, 10, 32),
    trim,
    [0, 0.205, 0.106],
    [1.03, 0.86, 1],
    [Math.PI / 2, 0, 0],
  );
  addFriendlyFace(group, 0.204, 0.173, 0x6a5b42, 0.035, 0.98);

  addMesh(group, new THREE.CapsuleGeometry(0.098, 0.095, 7, 16), suit, [0, 0.008, 0]);
  addMesh(group, starGeometry(0.038), warm, [0, 0.022, 0.101]);
  addMesh(group, new THREE.BoxGeometry(0.11, 0.09, 0.055), trim, [0, 0.025, -0.087]);

  [-1, 1].forEach((side) => {
    const arm = addMesh(
      group,
      new THREE.CapsuleGeometry(0.03, 0.082, 6, 12),
      suit,
      [side * 0.115, 0.01, 0.036],
    );
    arm.rotation.z = side * -0.48;
    addMesh(group, new THREE.SphereGeometry(0.034, 14, 12), suit, [side * 0.082, -0.058, 0.06]);
  });

  [-1, 1].forEach((side) => {
    const thigh = addMesh(
      group,
      new THREE.CapsuleGeometry(0.034, 0.064, 5, 12),
      suit,
      [side * 0.055, -0.125, 0.035],
    );
    thigh.rotation.x = -0.72;
    thigh.rotation.z = side * 0.16;
    const foot = addMesh(
      group,
      new THREE.BoxGeometry(0.072, 0.047, 0.092),
      boot,
      [side * 0.065, -0.17, 0.105],
    );
    foot.rotation.x = -0.22;
  });

  group.rotation.z = -0.085;
  return finishVariant(group, ASTRONAUT_VARIANTS[2], 0.86);
}

function variantNumberFor(entity) {
  if (typeof window === 'undefined') return 1;
  const requested = new URLSearchParams(window.location.search).get('astronaut')?.trim().toLowerCase();
  if (requested === 'preview') return (Math.abs(Number(entity?.order) || 0) % 3) + 1;
  return VARIANT_ALIASES.get(requested || '') || 1;
}

function createAstronautVariant(number) {
  if (number === 2) return starHopper();
  if (number === 3) return cozyDreamer();
  return bubbleBuddy();
}

/** Replace the detailed dark-visor astronaut with selectable kid-friendly models. */
export function installFriendlyAstronautOptions() {
  if (PlanetEntity.prototype.createAstronaut?.kidsGalaxyFriendlyAstronautOptions) return;

  function friendlyAstronaut() {
    return createAstronautVariant(variantNumberFor(this));
  }
  friendlyAstronaut.kidsGalaxyFriendlyAstronautOptions = true;
  PlanetEntity.prototype.createAstronaut = friendlyAstronaut;
}
