import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const INNER_RADIUS = 1.28;
const OUTER_RADIUS = 2.2;
const CASSINI_INNER = 1.73;
const CASSINI_OUTER = 1.82;
const FINE_DUST_COUNT = 16000;
const MICRO_DUST_COUNT = 9000;
const SPARKLE_COUNT = 1300;

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

function gaussian(value, centre, width) {
  const delta = (value - centre) / width;
  return Math.exp(-delta * delta * 0.5);
}

function normalizedRadius(radius) {
  return THREE.MathUtils.clamp(
    (radius - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS),
    0,
    1,
  );
}

function radialTone(radius) {
  const t = normalizedRadius(radius);
  const brightMiddle = gaussian(t, 0.46, 0.19) * 0.15;
  const secondBand = gaussian(t, 0.73, 0.1) * 0.045;
  const edgeShade = Math.pow(Math.abs(t - 0.5) * 2, 1.35) * 0.105;
  const fineStrata =
    Math.sin(t * Math.PI * 16 + 0.4) * 0.012 +
    Math.sin(t * Math.PI * 37 - 0.8) * 0.005;
  return brightMiddle + secondBand - edgeShade + fineStrata;
}

function densityAt(radius) {
  if (radius > CASSINI_INNER && radius < CASSINI_OUTER) return 0.055;
  if (radius > 1.465 && radius < 1.49) return 0.24;
  if (radius > 1.985 && radius < 2.015) return 0.3;
  const t = normalizedRadius(radius);
  const edgeFade = Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1));
  const broad = 0.42 + gaussian(t, 0.43, 0.23) * 0.5 + gaussian(t, 0.74, 0.12) * 0.18;
  return THREE.MathUtils.clamp(broad * (0.55 + edgeFade * 0.45), 0.12, 1);
}

function radialSample(random, minimum = INNER_RADIUS, maximum = OUTER_RADIUS) {
  const min2 = minimum * minimum;
  const max2 = maximum * maximum;
  return Math.sqrt(min2 + random() * (max2 - min2));
}

function sampleRingRadius(random, minimum = INNER_RADIUS, maximum = OUTER_RADIUS) {
  let fallback = radialSample(random, minimum, maximum);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const radius = radialSample(random, minimum, maximum);
    fallback = radius;
    if (random() <= densityAt(radius)) return radius;
  }
  return fallback;
}

function selectedIceColour(entity, radius, randomTone = 0) {
  const selected = new THREE.Color(entity.ringColor);
  const naturalIce = new THREE.Color(0xe7e3d9).lerp(selected, 0.24);
  return naturalIce.offsetHSL(0, -0.045, radialTone(radius) + randomTone);
}

function selectedRockColour(entity, radius, randomTone = 0) {
  const selected = new THREE.Color(entity.ringColor);
  const naturalRock = new THREE.Color(0xaaa69c).lerp(selected, 0.13);
  return naturalRock.offsetHSL(0, -0.055, radialTone(radius) * 0.62 + randomTone);
}

function createChunkBand(entity, { count, minimum, maximum, kind, speed, seedSuffix }) {
  const random = seededRandom(entity.animator.hashId(`${entity.id}-${seedSuffix}`));
  const ice = kind !== 'rock';
  const geometry = ice
    ? new THREE.IcosahedronGeometry(0.009, 0)
    : new THREE.DodecahedronGeometry(0.01, 0);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: ice ? 0.64 : 0.78,
    metalness: 0.004,
    clearcoat: ice ? 0.055 : 0.018,
    clearcoatRoughness: 0.78,
  });
  const particles = new THREE.InstancedMesh(geometry, material, count);
  particles.userData.kidsGalaxySaturnParticles = true;
  particles.userData.kidsGalaxyRingParticleKind = kind;
  particles.userData.kidsGalaxyRingAngularSpeed = speed;
  particles.userData.particleCount = count;
  particles.userData.maxParticleRadius = 0.032;
  particles.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const colour = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const radius = sampleRingRadius(random, minimum, maximum);
    const angle = random() * Math.PI * 2;
    const thickness = 0.008 + normalizedRadius(radius) * 0.012;
    position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      (random() - 0.5) * thickness,
    );
    euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    quaternion.setFromEuler(euler);

    const rareChunk = random() > 0.975;
    const baseSize = 0.52 + random() * (rareChunk ? 2.7 : 0.92);
    scale.set(
      baseSize * (0.72 + random() * 0.5),
      baseSize * (0.7 + random() * 0.54),
      baseSize * (0.58 + random() * 0.46),
    );
    matrix.compose(position, quaternion, scale);
    particles.setMatrixAt(index, matrix);

    const tone = -0.035 + random() * 0.075;
    colour.copy(
      ice
        ? selectedIceColour(entity, radius, tone)
        : selectedRockColour(entity, radius, tone),
    );
    particles.setColorAt(index, colour);
  }

  particles.instanceMatrix.needsUpdate = true;
  if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
  return particles;
}

function createPointLayer(entity, { count, size, opacity, speed, seedSuffix, rockChance = 0.08 }) {
  const random = seededRandom(entity.animator.hashId(`${entity.id}-${seedSuffix}`));
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const colour = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const radius = sampleRingRadius(random);
    const angle = random() * Math.PI * 2;
    const thickness = 0.007 + random() * 0.016;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = (random() - 0.5) * thickness;

    const tone = -0.045 + random() * 0.085;
    colour.copy(
      random() < rockChance
        ? selectedRockColour(entity, radius, tone)
        : selectedIceColour(entity, radius, tone),
    );
    colors[index * 3] = colour.r;
    colors[index * 3 + 1] = colour.g;
    colors[index * 3 + 2] = colour.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.userData.kidsGalaxySaturnDust = true;
  geometry.userData.innerRadius = INNER_RADIUS;
  geometry.userData.outerRadius = OUTER_RADIUS;
  geometry.userData.cassiniGap = [CASSINI_INNER, CASSINI_OUTER];

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size,
      vertexColors: true,
      transparent: true,
      opacity,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    }),
  );
  points.userData.kidsGalaxySaturnDust = true;
  points.userData.kidsGalaxyRingAngularSpeed = speed;
  points.userData.particleCount = count;
  points.userData.pointSize = size;
  points.frustumCulled = false;
  return points;
}

function createSparkleLayer(entity) {
  const random = seededRandom(entity.animator.hashId(`${entity.id}-saturn-sparkles`));
  const positions = new Float32Array(SPARKLE_COUNT * 3);
  const colors = new Float32Array(SPARKLE_COUNT * 3);
  const colour = new THREE.Color();

  for (let index = 0; index < SPARKLE_COUNT; index += 1) {
    const radius = sampleRingRadius(random, 1.39, 2.08);
    const angle = random() * Math.PI * 2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = (random() - 0.5) * 0.012;
    colour.copy(selectedIceColour(entity, radius, 0.075 + random() * 0.055));
    colors[index * 3] = colour.r;
    colors[index * 3 + 1] = colour.g;
    colors[index * 3 + 2] = colour.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.01,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.userData.kidsGalaxySaturnHaze = true;
  points.userData.kidsGalaxyRingAngularSpeed = 0.00145;
  points.userData.particleCount = SPARKLE_COUNT;
  return points;
}

function saturnAddPlanetRing() {
  const ring = new THREE.Group();
  ring.userData.kidsGalaxySaturnParticleRing = true;
  ring.userData.kidsGalaxyRingIsSolid = false;
  ring.userData.kidsGalaxyDifferentialRotation = true;
  ring.userData.kidsGalaxyFineGrainedSaturnRing = true;
  ring.userData.kidsGalaxyRingParticleCount = 0;
  ring.userData.innerRadius = INNER_RADIUS;
  ring.userData.outerRadius = OUTER_RADIUS;
  ring.userData.cassiniGap = [CASSINI_INNER, CASSINI_OUTER];

  const layers = [
    createPointLayer(this, {
      count: FINE_DUST_COUNT,
      size: 0.012,
      opacity: 0.78,
      speed: 0.0022,
      seedSuffix: 'saturn-fine-dust',
      rockChance: 0.055,
    }),
    createPointLayer(this, {
      count: MICRO_DUST_COUNT,
      size: 0.0065,
      opacity: 0.62,
      speed: 0.00172,
      seedSuffix: 'saturn-micro-dust',
      rockChance: 0.035,
    }),
    createChunkBand(this, {
      count: 420,
      minimum: INNER_RADIUS,
      maximum: 1.62,
      kind: 'ice',
      speed: 0.00325,
      seedSuffix: 'saturn-inner-ice',
    }),
    createChunkBand(this, {
      count: 520,
      minimum: 1.46,
      maximum: 1.99,
      kind: 'ice',
      speed: 0.00255,
      seedSuffix: 'saturn-middle-ice',
    }),
    createChunkBand(this, {
      count: 240,
      minimum: 1.84,
      maximum: OUTER_RADIUS,
      kind: 'rock',
      speed: 0.0019,
      seedSuffix: 'saturn-outer-rock',
    }),
    createSparkleLayer(this),
  ];

  layers.forEach((object) => {
    ring.add(object);
    ring.userData.kidsGalaxyRingParticleCount += object.userData.particleCount || 0;
  });

  ring.rotation.x = Math.PI / 2.55;
  ring.rotation.z = 0.18;
  this.scene.add(ring);
  this.decorations.push(ring);
}

/** Install a Saturn-like ring made from dense fine ice/dust and sparse small chunks. */
export function installSaturnPlanetRings() {
  if (PlanetEntity.prototype.addPlanetRing === saturnAddPlanetRing) return;
  const previousUpdate = PlanetEntity.prototype.update;
  PlanetEntity.prototype.addPlanetRing = saturnAddPlanetRing;

  function saturnRingUpdate(t, behavior = {}) {
    previousUpdate.call(this, t, behavior);
    const speed = Number(behavior.planet_speed) || 1;
    this.decorations.forEach((decoration) => {
      if (!decoration.userData?.kidsGalaxySaturnParticleRing) return;
      decoration.children.forEach((layer) => {
        const angularSpeed = Number(layer.userData?.kidsGalaxyRingAngularSpeed) || 0;
        layer.rotation.z += angularSpeed * speed;
      });
    });
  }
  saturnRingUpdate.kidsGalaxySaturnParticleRings = true;
  PlanetEntity.prototype.update = saturnRingUpdate;
}
