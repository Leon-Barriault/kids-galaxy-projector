import * as THREE from 'three';

export function normalizeTheme(theme) {
  return ['halloween', 'christmas', 'easter'].includes(theme) ? theme : 'default';
}

export function asteroidStyleForTheme(theme) {
  const normalized = normalizeTheme(theme);
  if (normalized === 'halloween') return 'pumpkin';
  if (normalized === 'christmas') return 'snowball';
  return 'rock';
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

export function createAsteroidGeometry(theme, radius = 0.16) {
  const style = asteroidStyleForTheme(theme);
  let geometry;
  if (style === 'pumpkin') {
    geometry = deformPumpkin(new THREE.SphereGeometry(radius, 28, 20));
    geometry.userData.kidsGalaxyPumpkin = true;
  } else if (style === 'snowball') {
    geometry = deformSnowball(new THREE.IcosahedronGeometry(radius, 3));
    geometry.userData.kidsGalaxySnowball = true;
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
