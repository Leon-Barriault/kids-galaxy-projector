import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const ROCK_COUNT = 220;
const DUST_COUNT = 420;
const RING_BANDS = [
  [1.2, 1.39],
  [1.47, 1.7],
  [1.78, 2.12],
];

function seededRandom(seed) {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shiftedColor(base, lightness, saturation = -0.06) {
  return base.clone().offsetHSL(0, saturation, lightness);
}

function chooseBand(random) {
  const roll = random();
  if (roll < 0.27) return RING_BANDS[0];
  if (roll < 0.61) return RING_BANDS[1];
  return RING_BANDS[2];
}

function createRockField(entity) {
  const random = seededRandom(entity.animator.hashId(`${entity.id}-rock-ring`));
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  geometry.userData.kidsGalaxyRingRockGeometry = true;
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.02,
    clearcoat: 0.05,
    clearcoatRoughness: 0.75,
  });
  const rocks = new THREE.InstancedMesh(geometry, material, ROCK_COUNT);
  rocks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  rocks.userData.kidsGalaxyRockRing = true;
  rocks.userData.kidsGalaxyRingWobbleTarget = 'planet-decoration';
  rocks.userData.rockCount = ROCK_COUNT;
  rocks.userData.innerRadius = RING_BANDS[0][0];
  rocks.userData.outerRadius = RING_BANDS[RING_BANDS.length - 1][1];

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const base = new THREE.Color(entity.ringColor);

  for (let index = 0; index < ROCK_COUNT; index += 1) {
    const [inner, outer] = chooseBand(random);
    const radius = THREE.MathUtils.lerp(inner, outer, random());
    const angle = random() * Math.PI * 2;
    const thickness = (random() - 0.5) * (0.07 + (radius - inner) * 0.08);
    position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, thickness);

    euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    quaternion.setFromEuler(euler);
    const size = 0.026 + Math.pow(random(), 1.7) * 0.072;
    scale.set(
      size * (0.7 + random() * 1.35),
      size * (0.65 + random() * 1.0),
      size * (0.55 + random() * 0.9),
    );
    matrix.compose(position, quaternion, scale);
    rocks.setMatrixAt(index, matrix);

    const radialT = (radius - 1.2) / (2.12 - 1.2);
    const lightness = 0.1 - radialT * 0.16 + (random() - 0.5) * 0.13;
    rocks.setColorAt(index, shiftedColor(base, lightness));
  }

  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  return rocks;
}

function createRingDust(entity) {
  const random = seededRandom(entity.animator.hashId(`${entity.id}-ring-dust`));
  const positions = new Float32Array(DUST_COUNT * 3);
  const colors = new Float32Array(DUST_COUNT * 3);
  const base = new THREE.Color(entity.ringColor);

  for (let index = 0; index < DUST_COUNT; index += 1) {
    const [inner, outer] = chooseBand(random);
    const radius = THREE.MathUtils.lerp(inner, outer, random());
    const angle = random() * Math.PI * 2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = (random() - 0.5) * 0.08;

    const color = shiftedColor(base, -0.03 + (random() - 0.5) * 0.18, -0.1);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.userData.kidsGalaxyRingDust = true;
  const material = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const dust = new THREE.Points(geometry, material);
  dust.userData.kidsGalaxyRingDust = true;
  dust.userData.dustCount = DUST_COUNT;
  return dust;
}

function rockyAddPlanetRing() {
  const ringSystem = new THREE.Group();
  ringSystem.userData.kidsGalaxyRockRingSystem = true;
  ringSystem.userData.kidsGalaxyRingWobbleTarget = 'planet-decoration';
  ringSystem.userData.innerRadius = RING_BANDS[0][0];
  ringSystem.userData.outerRadius = RING_BANDS[RING_BANDS.length - 1][1];
  ringSystem.rotation.x = Math.PI / 2.45;
  ringSystem.rotation.z = 0.2;

  const rocks = createRockField(this);
  const dust = createRingDust(this);
  ringSystem.add(rocks, dust);

  this.scene.add(ringSystem);
  this.decorations.push(ringSystem);
}

/**
 * Install the textured Saturn-style ring implementation before any planets
 * are created. This keeps PlanetEntity focused on lifecycle ownership while
 * allowing the ring renderer to evolve independently.
 */
export function installRockyPlanetRings() {
  if (PlanetEntity.prototype.addPlanetRing === rockyAddPlanetRing) return;
  PlanetEntity.prototype.addPlanetRing = rockyAddPlanetRing;
}
