import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

export const ASTRONAUT_VARIANTS = Object.freeze([
  Object.freeze({ id: 1, key: 'pixel-explorer', label: 'Pixel Explorer' }),
  Object.freeze({ id: 2, key: 'solar-scout', label: 'Solar Scout' }),
  Object.freeze({ id: 3, key: 'jetpack-jumper', label: 'Jetpack Jumper' }),
]);

const VARIANT_ALIASES = new Map([
  ['1', 1],
  ['pixel', 1],
  ['explorer', 1],
  ['pixel-explorer', 1],
  ['bubble', 1],
  ['buddy', 1],
  ['bubble-buddy', 1],
  ['2', 2],
  ['solar', 2],
  ['scout', 2],
  ['solar-scout', 2],
  ['star', 2],
  ['hopper', 2],
  ['star-hopper', 2],
  ['3', 3],
  ['jetpack', 3],
  ['jumper', 3],
  ['jetpack-jumper', 3],
  ['cozy', 3],
  ['dreamer', 3],
  ['cozy-dreamer', 3],
]);

function physicalMaterial(color, overrides = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.68,
    metalness: 0.01,
    clearcoat: 0.035,
    clearcoatRoughness: 0.84,
    ...overrides,
  });
}

function standardMaterial(color, overrides = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.01,
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

function addBlock(group, size, material, position, rotation = null) {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position, null, rotation);
}

function markVisor(mesh) {
  mesh.userData.kidsGalaxyAstronautVisor = true;
  mesh.userData.kidsGalaxyAstronautVisorTone = 'charcoal-pixel';
  mesh.userData.kidsGalaxyApprovedDarkPixelVisor = true;
  return mesh;
}

function markHighlight(mesh) {
  mesh.userData.kidsGalaxyAstronautVisorHighlight = true;
  return mesh;
}

function astronautMaterials(accent) {
  return {
    outline: standardMaterial(0x24272b),
    suit: physicalMaterial(0xf4f5f2, {
      emissive: 0x171817,
      emissiveIntensity: 0.22,
    }),
    white: standardMaterial(0xffffff, {
      roughness: 0.42,
      emissive: 0x202020,
      emissiveIntensity: 0.18,
    }),
    shadow: standardMaterial(0xbec3c5),
    visor: physicalMaterial(0x111417, {
      roughness: 0.28,
      clearcoat: 0.3,
      clearcoatRoughness: 0.22,
    }),
    panel: standardMaterial(0x596167),
    accent: standardMaterial(accent),
  };
}

function addPixelVisorHighlights(group, white) {
  // These sit just in front of the visor surface so the white pixel glints stay
  // readable even when the companion is only a few dozen projector pixels tall.
  const z = 0.272;
  markHighlight(addBlock(group, [0.035, 0.012, 0.012], white, [-0.055, 0.247, z]));
  markHighlight(addBlock(group, [0.012, 0.035, 0.012], white, [-0.055, 0.247, z + 0.001]));
  markHighlight(addBlock(group, [0.016, 0.016, 0.012], white, [0.063, 0.237, z]));
  markHighlight(addBlock(group, [0.011, 0.017, 0.012], white, [-0.073, 0.166, z]));
}

function addHelmet(group, materials, accentOnHelmet) {
  const { outline, suit, visor, white, accent } = materials;

  // The dark shell is slightly larger but sits behind the forward-shifted white
  // helmet. Their intersection leaves a thin pixel-like charcoal silhouette
  // instead of covering the whole helmet with black.
  addMesh(group, new THREE.SphereGeometry(0.195, 10, 7), outline, [0, 0.213, 0]);
  addMesh(group, new THREE.SphereGeometry(0.178, 10, 7), suit, [0, 0.214, 0.035]);

  const visorMesh = addMesh(
    group,
    new THREE.SphereGeometry(0.146, 10, 7),
    visor,
    [0, 0.217, 0.195],
    [1.09, 0.79, 0.47],
  );
  markVisor(visorMesh);
  addPixelVisorHighlights(group, white);

  [-1, 1].forEach((side) => {
    addBlock(group, [0.043, 0.077, 0.058], outline, [side * 0.181, 0.21, 0]);
    addBlock(
      group,
      [0.029, 0.059, 0.064],
      accentOnHelmet ? accent : suit,
      [side * 0.181, 0.21, 0.008],
    );
  });

  addBlock(group, [0.178, 0.03, 0.034], outline, [0, 0.36, 0.015]);
  addBlock(
    group,
    [0.154, 0.019, 0.038],
    accentOnHelmet ? accent : suit,
    [0, 0.361, 0.026],
  );
}

function addTorso(group, materials, accentMode) {
  const { outline, suit, shadow, panel, accent } = materials;
  addBlock(group, [0.23, 0.214, 0.142], outline, [0, -0.004, 0]);
  addBlock(group, [0.202, 0.188, 0.148], suit, [0, 0, 0.011]);

  addBlock(group, [0.112, 0.068, 0.02], outline, [0, 0.025, 0.09]);
  addBlock(group, [0.096, 0.052, 0.022], shadow, [0, 0.025, 0.101]);
  addBlock(group, [0.025, 0.028, 0.012], panel, [-0.025, 0.025, 0.116]);
  addBlock(group, [0.013, 0.013, 0.012], accent, [0.025, 0.034, 0.117]);
  addBlock(group, [0.013, 0.013, 0.012], panel, [0.025, 0.014, 0.117]);

  if (accentMode === 'orange') {
    addBlock(group, [0.032, 0.046, 0.018], accent, [-0.07, -0.067, 0.095]);
    addBlock(group, [0.032, 0.046, 0.018], accent, [0.07, -0.067, 0.095]);
  } else if (accentMode === 'blue') {
    addBlock(group, [0.036, 0.024, 0.018], accent, [-0.086, 0.04, 0.096]);
    addBlock(group, [0.036, 0.024, 0.018], accent, [0.086, 0.04, 0.096]);
  }
}

function addArms(group, materials, pose = 'down') {
  const { outline, suit, shadow, accent } = materials;
  [-1, 1].forEach((side) => {
    const outward = pose === 'float' ? side * 0.12 : 0;
    const upperY = pose === 'float' ? 0.03 : -0.01;
    const rotation = pose === 'float' ? [0, 0, side * -0.32] : null;
    addBlock(
      group,
      [0.066, 0.148, 0.09],
      outline,
      [side * 0.145 + outward * 0.1, upperY, 0],
      rotation,
    );
    addBlock(
      group,
      [0.048, 0.13, 0.096],
      suit,
      [side * 0.145 + outward * 0.1, upperY, 0.008],
      rotation,
    );
    addBlock(group, [0.05, 0.028, 0.1], accent, [side * 0.145, upperY - 0.041, 0.011], rotation);
    addBlock(group, [0.063, 0.054, 0.094], outline, [side * 0.147, upperY - 0.101, 0.006], rotation);
    addBlock(group, [0.047, 0.04, 0.1], shadow, [side * 0.147, upperY - 0.101, 0.014], rotation);
  });
}

function addLegs(group, materials, accentMode) {
  const { outline, suit, shadow, accent } = materials;
  [-1, 1].forEach((side) => {
    addBlock(group, [0.082, 0.122, 0.105], outline, [side * 0.063, -0.178, 0.006]);
    addBlock(group, [0.064, 0.105, 0.111], suit, [side * 0.063, -0.174, 0.014]);
    if (accentMode !== 'none') {
      addBlock(group, [0.067, 0.026, 0.115], accent, [side * 0.063, -0.196, 0.018]);
    }
    addBlock(group, [0.09, 0.058, 0.135], outline, [side * 0.066, -0.263, 0.028]);
    addBlock(group, [0.072, 0.042, 0.141], shadow, [side * 0.066, -0.258, 0.038]);
  });
}

function addBackpack(group, materials, withFlame) {
  const { outline, shadow, accent } = materials;
  addBlock(group, [0.13, 0.18, 0.08], outline, [0, -0.005, -0.11]);
  addBlock(group, [0.108, 0.158, 0.072], shadow, [0, -0.005, -0.122]);
  addBlock(group, [0.035, 0.125, 0.08], accent, [0.048, -0.005, -0.165]);

  if (!withFlame) return;
  const orange = standardMaterial(0xff6a1a, { emissive: 0x7a1600, emissiveIntensity: 0.5 });
  const yellow = standardMaterial(0xffdc32, { emissive: 0x8a5b00, emissiveIntensity: 0.55 });
  addBlock(group, [0.046, 0.09, 0.045], orange, [0.06, -0.112, -0.165], [0, 0, -0.18]);
  addBlock(group, [0.032, 0.074, 0.035], yellow, [0.068, -0.175, -0.165], [0, 0, -0.18]);
  addBlock(group, [0.02, 0.05, 0.025], yellow, [0.074, -0.225, -0.165], [0, 0, -0.18]);
}

function finishVariant(group, variant, accentName, scale = 0.88) {
  group.scale.setScalar(scale);
  group.userData.kidsGalaxyFriendlyAstronaut = true;
  group.userData.kidsGalaxyApprovedPixelAstronaut = true;
  group.userData.kidsGalaxyAstronautVariantNumber = variant.id;
  group.userData.kidsGalaxyAstronautVariant = variant.key;
  group.userData.kidsGalaxyAstronautVariantLabel = variant.label;
  group.userData.kidsGalaxyAstronautAccent = accentName;
  group.userData.kidsGalaxyAstronautPreviewQuery = `astronaut=${variant.id}`;
  return group;
}

function pixelExplorer() {
  const group = new THREE.Group();
  const materials = astronautMaterials(0x4c86cf);
  addHelmet(group, materials, false);
  addTorso(group, materials, 'none');
  addArms(group, materials, 'down');
  addLegs(group, materials, 'none');
  addBackpack(group, materials, false);
  return finishVariant(group, ASTRONAUT_VARIANTS[0], 'blue-control');
}

function solarScout() {
  const group = new THREE.Group();
  const materials = astronautMaterials(0xffa126);
  addHelmet(group, materials, true);
  addTorso(group, materials, 'orange');
  addArms(group, materials, 'down');
  addLegs(group, materials, 'orange');
  addBackpack(group, materials, false);
  return finishVariant(group, ASTRONAUT_VARIANTS[1], 'orange');
}

function jetpackJumper() {
  const group = new THREE.Group();
  const materials = astronautMaterials(0x4c86cf);
  addHelmet(group, materials, false);
  addTorso(group, materials, 'blue');
  addArms(group, materials, 'float');
  addLegs(group, materials, 'blue');
  addBackpack(group, materials, true);
  group.rotation.z = -0.045;
  return finishVariant(group, ASTRONAUT_VARIANTS[2], 'blue-jetpack', 0.9);
}

function stableVariantFromPlanet(entity) {
  const seed = String(entity?.id || entity?.order || 'astronaut');
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % ASTRONAUT_VARIANTS.length) + 1;
}

function variantNumberFor(entity) {
  if (typeof window === 'undefined') return stableVariantFromPlanet(entity);
  const requested = new URLSearchParams(window.location.search).get('astronaut')?.trim().toLowerCase();
  if (requested === 'preview') return (Math.abs(Number(entity?.order) || 0) % 3) + 1;
  if (requested && VARIANT_ALIASES.has(requested)) return VARIANT_ALIASES.get(requested);
  // Planet ids are generated independently for kid submissions, so hashing the id
  // gives each astronaut an effectively random but reload-stable model choice.
  return stableVariantFromPlanet(entity);
}

function createAstronautVariant(number) {
  if (number === 2) return solarScout();
  if (number === 3) return jetpackJumper();
  return pixelExplorer();
}

/** Replace the old companion with selectable, kid-friendly pixel/chibi astronauts. */
export function installFriendlyAstronautOptions() {
  if (PlanetEntity.prototype.createAstronaut?.kidsGalaxyFriendlyAstronautOptions) return;

  function friendlyAstronaut() {
    return createAstronautVariant(variantNumberFor(this));
  }
  friendlyAstronaut.kidsGalaxyFriendlyAstronautOptions = true;
  PlanetEntity.prototype.createAstronaut = friendlyAstronaut;
}
