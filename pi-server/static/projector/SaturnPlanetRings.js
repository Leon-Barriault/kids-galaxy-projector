import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const INNER_RADIUS = 1.28;
const OUTER_RADIUS = 2.18;
const CASSINI_INNER = 1.72;
const CASSINI_OUTER = 1.82;
const DUST_COUNT = 1900;

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

function selectedIceColour(entity, lightness = 0.08) {
  const selected = new THREE.Color(entity.ringColor);
  return new THREE.Color(0xf4f1e9).lerp(selected, 0.32).offsetHSL(0, -0.08, lightness);
}

function selectedRockColour(entity) {
  const selected = new THREE.Color(entity.ringColor);
  return new THREE.Color(0x595a5e).lerp(selected, 0.16).offsetHSL(0, -0.16, -0.02);
}

function radialSample(random, minimum, maximum) {
  const min2 = minimum * minimum;
  const max2 = maximum * maximum;
  return Math.sqrt(min2 + random() * (max2 - min2));
}

function sampleRingRadius(random, minimum, maximum) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const radius = radialSample(random, minimum, maximum);
    if (radius > CASSINI_INNER && radius < CASSINI_OUTER) {
      if (random() < 0.9) continue;
    }
    // Natural narrow gaps keep the ring from becoming a filled plate.
    const fineGap =
      (radius > 1.47 && radius < 1.50) ||
      (radius > 1.96 && radius < 1.985);
    if (fineGap && random() < 0.72) continue;
    return radius;
  }
  return radialSample(random, minimum, maximum);
}

function particleMaterial(color, roughness) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.015,
    clearcoat: 0.035,
    clearcoatRoughness: 0.78,
  });
}

function createParticleBand(
  entity,
  {
    count,
    minimum,
    maximum,
    kind,
    speed,
    seedSuffix,
  },
) {
  const random = seededRandom(entity.animator.hashId(`${entity.id}-${seedSuffix}`));
  const ice = kind !== 'rock';
  const geometry = ice
    ? new THREE.IcosahedronGeometry(0.026, 0)
    : new THREE.DodecahedronGeometry(0.031, 0);
  const material = particleMaterial(
    ice ? selectedIceColour(entity) : selectedRockColour(entity),
    ice ? 0.56 : 0.79,
  );
  const particles = new THREE.InstancedMesh(geometry, material, count);
  particles.userData.kidsGalaxySaturnParticles = true;
  particles.userData.kidsGalaxyRingParticleKind = kind;
  particles.userData.kidsGalaxyRingAngularSpeed = speed;
  particles.userData.particleCount = count;
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
    const verticalThickness = 0.012 + ((radius - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS)) * 0.018;
    position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      (random() - 0.5) * verticalThickness,
    );
    euler.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    quaternion.setFromEuler(euler);

    const rareLargePiece = random() > 0.93;
    const size = ice
      ? 0.45 + random() * (rareLargePiece ? 1.9 : 1.05)
      : 0.5 + random() * (rareLargePiece ? 1.65 : 0.95);
    scale.set(
      size * (0.74 + random() * 0.52),
      size * (0.72 + random() * 0.56),
      size * (0.6 + random() * 0.48),
    );
    matrix.compose(position, quaternion, scale);
    particles.setMatrixAt(index, matrix);

    if (ice) {
      colour.copy(selectedIceColour(entity, -0.04 + random() * 0.16));
      if (random() < 0.18) colour.lerp(new THREE.Color(0xffffff), 0.34);
    } else {
      colour.copy(selectedRockColour(entity)).offsetHSL(0, 0, -0.08 + random() * 0.14);
    }
    particles.setColorAt(index, colour);
  }

  particles.instanceMatrix.needsUpdate = true;
  if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
  return particles;
}

function createDust(entity) {
  const random = seededRandom(entity.animator.hashId(`${entity.id}-saturn-dust`));
  const positions = new Float32Array(DUST_COUNT * 3);
  const colors = new Float32Array(DUST_COUNT * 3);
  const ice = selectedIceColour(entity, 0.04);
  const rock = selectedRockColour(entity);
  const colour = new THREE.Color();

  for (let index = 0; index < DUST_COUNT; index += 1) {
    const radius = sampleRingRadius(random, INNER_RADIUS, OUTER_RADIUS);
    const angle = random() * Math.PI * 2;
    const thickness = 0.018 + random() * 0.028;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = (random() - 0.5) * thickness;

    if (random() < 0.83) {
      colour.copy(ice).offsetHSL(0, -0.02, -0.08 + random() * 0.17);
    } else {
      colour.copy(rock).offsetHSL(0, 0, -0.04 + random() * 0.11);
    }
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
      size: 0.034,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      sizeAttenuation: true,
      depthWrite: false,
    }),
  );
  points.userData.kidsGalaxySaturnDust = true;
  points.userData.kidsGalaxyRingAngularSpeed = 0.0017;
  points.userData.particleCount = DUST_COUNT;
  return points;
}

function createRingGlow(entity) {
  // A very faint point layer supplies the continuous-looking fine ice haze
  // without putting any solid disc or opaque annulus around the planet.
  const random = seededRandom(entity.animator.hashId(`${entity.id}-saturn-haze`));
  const count = 700;
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const tint = selectedIceColour(entity, 0.1);

  for (let index = 0; index < count; index += 1) {
    const radius = sampleRingRadius(random, INNER_RADIUS, OUTER_RADIUS);
    const angle = random() * Math.PI * 2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = (random() - 0.5) * 0.018;
    colours[index * 3] = tint.r;
    colours[index * 3 + 1] = tint.g;
    colours[index * 3 + 2] = tint.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.018,
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  points.userData.kidsGalaxySaturnHaze = true;
  points.userData.kidsGalaxyRingAngularSpeed = 0.00135;
  points.userData.particleCount = count;
  return points;
}

function saturnAddPlanetRing() {
  const ring = new THREE.Group();
  ring.userData.kidsGalaxySaturnParticleRing = true;
  ring.userData.kidsGalaxyRingIsSolid = false;
  ring.userData.kidsGalaxyDifferentialRotation = true;
  ring.userData.kidsGalaxyRingParticleCount = 0;
  ring.userData.innerRadius = INNER_RADIUS;
  ring.userData.outerRadius = OUTER_RADIUS;
  ring.userData.cassiniGap = [CASSINI_INNER, CASSINI_OUTER];

  const bands = [
    createParticleBand(this, {
      count: 260,
      minimum: INNER_RADIUS,
      maximum: 1.57,
      kind: 'ice',
      speed: 0.0037,
      seedSuffix: 'saturn-inner-ice',
    }),
    createParticleBand(this, {
      count: 300,
      minimum: 1.50,
      maximum: 1.94,
      kind: 'ice',
      speed: 0.00275,
      seedSuffix: 'saturn-middle-ice',
    }),
    createParticleBand(this, {
      count: 190,
      minimum: 1.83,
      maximum: OUTER_RADIUS,
      kind: 'rock',
      speed: 0.00205,
      seedSuffix: 'saturn-outer-rock',
    }),
  ];
  const dust = createDust(this);
  const haze = createRingGlow(this);
  [...bands, dust, haze].forEach((object) => {
    ring.add(object);
    ring.userData.kidsGalaxyRingParticleCount += object.userData.particleCount || 0;
  });

  ring.rotation.x = Math.PI / 2.55;
  ring.rotation.z = 0.18;
  this.scene.add(ring);
  this.decorations.push(ring);
}

/** Install a Saturn-like ring made only from independently rotating particles. */
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
