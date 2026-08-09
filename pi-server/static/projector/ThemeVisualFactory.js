import * as THREE from 'three';

const EASTER_EGG_PALETTE = [
  0xf7a8cf,
  0xb8a5ff,
  0x8eddf5,
  0xffd778,
  0xa8e7a0,
  0xf3b58a,
];

export function normalizeTheme(theme) {
  return ['halloween', 'christmas', 'easter'].includes(theme) ? theme : 'default';
}

export function asteroidStyleForTheme(theme) {
  const normalized = normalizeTheme(theme);
  if (normalized === 'halloween') return 'pumpkin';
  if (normalized === 'christmas') return 'snowball';
  if (normalized === 'easter') return 'easter-egg';
  return 'rock';
}

export function easterEggColorFor(index) {
  return new THREE.Color(EASTER_EGG_PALETTE[Math.abs(index) % EASTER_EGG_PALETTE.length]);
}

function deformPumpkin(geometry) {
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const angle = Math.atan2(vertex.z, vertex.x);
    const lobe = 1 + Math.cos(angle * 8) * 0.085;
    vertex.x *= lobe;
    vertex.z *= lobe;
    vertex.y *= 0.9;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function deformSnowball(geometry) {
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const radius = vertex.length();
    if (radius <= 0) continue;
    const normal = vertex.clone().normalize();
    const variation =
      1 +
      Math.sin(normal.x * 13 + normal.z * 7) * 0.018 +
      Math.sin(normal.y * 17 - normal.x * 5) * 0.012;
    vertex.multiplyScalar(variation);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function deformEasterEgg(geometry, radius) {
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    vertex.y *= 1.28;
    const normalizedY = THREE.MathUtils.clamp(vertex.y / (radius * 1.28), -1, 1);
    const taper = normalizedY > 0
      ? 1 - normalizedY * 0.17
      : 1 + Math.abs(normalizedY) * 0.035;
    vertex.x *= taper;
    vertex.z *= taper;
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;

  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const normalizedY = THREE.MathUtils.clamp(
      (position.getY(index) / (radius * 1.28) + 1) / 2,
      0,
      1,
    );
    const stripe = 0.82 + (0.5 + 0.5 * Math.sin(normalizedY * Math.PI * 9)) * 0.18;
    const dotRipple = 0.96 + Math.sin(normalizedY * Math.PI * 23) * 0.025;
    const tone = THREE.MathUtils.clamp(stripe * dotRipple, 0.78, 1);
    colors[index * 3] = tone;
    colors[index * 3 + 1] = tone;
    colors[index * 3 + 2] = tone;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.userData.kidsGalaxyEasterEggPattern = true;
  return geometry;
}

export function createAsteroidGeometry(theme, radius = 0.16) {
  const style = asteroidStyleForTheme(theme);
  let geometry;
  if (style === 'pumpkin') {
    geometry = deformPumpkin(new THREE.SphereGeometry(radius, 28, 20));
    geometry.userData.kidsGalaxyPumpkin = true;
  } else if (style === 'snowball') {
    geometry = deformSnowball(new THREE.IcosahedronGeometry(radius, 3));
    geometry.userData.kidsGalaxySnowball = true;
  } else if (style === 'easter-egg') {
    geometry = deformEasterEgg(new THREE.SphereGeometry(radius, 34, 26), radius);
    geometry.userData.kidsGalaxyEasterEgg = true;
  } else {
    geometry = new THREE.IcosahedronGeometry(radius, 1);
    geometry.userData.kidsGalaxyAsteroidRock = true;
  }
  geometry.userData.kidsGalaxyAsteroidStyle = style;
  return geometry;
}

export function createAsteroidMaterial(theme) {
  const style = asteroidStyleForTheme(theme);
  if (style === 'pumpkin') {
    return new THREE.MeshPhysicalMaterial({
      color: 0xf27922,
      roughness: 0.62,
      metalness: 0.005,
      clearcoat: 0.08,
      clearcoatRoughness: 0.68,
    });
  }
  if (style === 'snowball') {
    return new THREE.MeshPhysicalMaterial({
      color: 0xf7fbff,
      roughness: 0.84,
      metalness: 0,
      clearcoat: 0.025,
      clearcoatRoughness: 0.9,
    });
  }
  if (style === 'easter-egg') {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.43,
      metalness: 0.002,
      clearcoat: 0.14,
      clearcoatRoughness: 0.5,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: 0x81766c,
    roughness: 0.9,
    metalness: 0.025,
  });
}

export function createPumpkinStemGeometry(radius = 0.16) {
  const geometry = new THREE.CylinderGeometry(radius * 0.16, radius * 0.21, radius * 0.55, 8);
  geometry.translate(0, radius * 1.08, 0);
  geometry.userData.kidsGalaxyPumpkinStem = true;
  return geometry;
}

export function createPumpkinStemMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x4d6d32,
    roughness: 0.86,
    metalness: 0,
  });
}

function physicalMaterial(color, roughness = 0.62, clearcoat = 0.06) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0.004,
    clearcoat,
    clearcoatRoughness: Math.min(0.9, roughness + 0.12),
  });
}

export function createWitchOnBroom() {
  const group = new THREE.Group();
  group.userData.kidsGalaxyWitchOnBroom = true;

  const dressMaterial = physicalMaterial(0x33204d, 0.68, 0.04);
  const hatMaterial = physicalMaterial(0x21162f, 0.72, 0.03);
  const skinMaterial = physicalMaterial(0x88b65a, 0.7, 0.03);
  const broomMaterial = physicalMaterial(0x8b5a32, 0.76, 0.03);
  const strawMaterial = physicalMaterial(0xc79a52, 0.82, 0.02);

  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 20), dressMaterial);
  dress.position.y = -0.04;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 18), skinMaterial);
  head.position.set(0, 0.16, 0.01);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.018, 28), hatMaterial);
  brim.position.y = 0.23;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 24), hatMaterial.clone());
  crown.position.y = 0.325;
  crown.rotation.z = -0.12;

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.72, 12), broomMaterial);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.08, -0.1, 0);

  const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 16), strawMaterial);
  bristles.rotation.z = -Math.PI / 2;
  bristles.position.set(-0.34, -0.1, 0);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 10), skinMaterial.clone());
  hand.position.set(0.09, 0.01, 0.02);

  group.add(dress, head, brim, crown, handle, bristles, hand);
  group.scale.setScalar(1.05);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return group;
}

export function createWhiteBunny() {
  const group = new THREE.Group();
  group.userData.kidsGalaxyWhiteBunny = true;

  const fur = physicalMaterial(0xf8f7f3, 0.58, 0.08);
  const pink = physicalMaterial(0xf5a9bd, 0.54, 0.08);
  const eye = physicalMaterial(0x22242a, 0.38, 0.11);
  const eggMaterial = physicalMaterial(0xb99cf3, 0.42, 0.13);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.105, 28, 22), fur);
  body.scale.set(1, 1.22, 0.92);
  body.position.y = -0.015;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 28, 22), fur.clone());
  head.position.y = 0.145;

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.04, 18, 14), fur.clone());
  tail.position.set(-0.085, -0.015, -0.075);

  const earGeometry = new THREE.SphereGeometry(0.052, 22, 16);
  const leftEar = new THREE.Mesh(earGeometry, fur.clone());
  leftEar.scale.set(0.56, 1.65, 0.48);
  leftEar.position.set(-0.043, 0.285, 0);
  leftEar.rotation.z = 0.12;
  const rightEar = new THREE.Mesh(earGeometry.clone(), fur.clone());
  rightEar.scale.set(0.56, 1.65, 0.48);
  rightEar.position.set(0.043, 0.285, 0);
  rightEar.rotation.z = -0.12;

  const innerEarGeometry = new THREE.SphereGeometry(0.034, 18, 14);
  const leftInner = new THREE.Mesh(innerEarGeometry, pink);
  leftInner.scale.set(0.42, 1.6, 0.28);
  leftInner.position.set(-0.043, 0.292, 0.041);
  leftInner.rotation.z = 0.12;
  const rightInner = new THREE.Mesh(innerEarGeometry.clone(), pink.clone());
  rightInner.scale.set(0.42, 1.6, 0.28);
  rightInner.position.set(0.043, 0.292, 0.041);
  rightInner.rotation.z = -0.12;

  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 10), eye);
  leftEye.position.set(-0.03, 0.16, 0.075);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 10), eye.clone());
  rightEye.position.set(0.03, 0.16, 0.075);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 10), pink.clone());
  nose.scale.set(1.1, 0.8, 0.8);
  nose.position.set(0, 0.13, 0.084);

  const egg = new THREE.Mesh(
    deformEasterEgg(new THREE.SphereGeometry(0.047, 22, 16), 0.047),
    eggMaterial,
  );
  egg.position.set(0, 0.015, 0.095);
  egg.rotation.z = 0.16;

  const pawGeometry = new THREE.SphereGeometry(0.027, 16, 12);
  const leftPaw = new THREE.Mesh(pawGeometry, fur.clone());
  leftPaw.position.set(-0.055, 0.018, 0.09);
  const rightPaw = new THREE.Mesh(pawGeometry.clone(), fur.clone());
  rightPaw.position.set(0.055, 0.018, 0.09);

  group.add(
    body,
    head,
    tail,
    leftEar,
    rightEar,
    leftInner,
    rightInner,
    leftEye,
    rightEye,
    nose,
    egg,
    leftPaw,
    rightPaw,
  );
  group.scale.setScalar(1.05);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return group;
}

function seededUnit(seed, salt) {
  let value = (seed ^ Math.imul(salt + 1, 0x45d9f3b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b) >>> 0;
  value ^= value >>> 16;
  return value / 4294967295;
}

export function createChristmasTree(seed = 1, accentColor = 0xffd65c) {
  const group = new THREE.Group();
  group.userData.kidsGalaxyChristmasTree = true;

  const greenShift = seededUnit(seed, 2) * 0.08 - 0.04;
  const foliageColor = new THREE.Color(0x2e9a52).offsetHSL(greenShift, 0, greenShift * 0.4);
  const foliageMaterial = physicalMaterial(foliageColor, 0.72, 0.035);
  const trunkMaterial = physicalMaterial(0x765037, 0.78, 0.025);
  const accentMaterial = physicalMaterial(accentColor, 0.48, 0.1);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.14, 10), trunkMaterial);
  trunk.position.y = 0.07;
  group.add(trunk);

  const tiers = [
    { radius: 0.16, height: 0.22, y: 0.18 },
    { radius: 0.13, height: 0.2, y: 0.3 },
    { radius: 0.095, height: 0.17, y: 0.41 },
  ];
  tiers.forEach(({ radius, height, y }) => {
    const tier = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 22), foliageMaterial.clone());
    tier.position.y = y;
    group.add(tier);
  });

  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), accentMaterial);
  star.position.y = 0.52;
  group.add(star);

  const ornamentPositions = [
    [-0.07, 0.27, 0.09],
    [0.08, 0.34, 0.03],
    [0.025, 0.2, -0.11],
  ];
  ornamentPositions.forEach((position, index) => {
    const ornament = new THREE.Mesh(
      new THREE.SphereGeometry(0.018 + index * 0.002, 12, 9),
      accentMaterial.clone(),
    );
    ornament.position.set(...position);
    group.add(ornament);
  });

  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return group;
}
