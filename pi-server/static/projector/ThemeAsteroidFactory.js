import * as THREE from 'three';

import {
  createAsteroidGeometry,
  createAsteroidMaterial,
  easterEggColorFor,
} from './ThemeVisualFactory.js';

function physicalMaterial(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.65,
    metalness: 0.004,
    clearcoat: 0.06,
    clearcoatRoughness: 0.72,
    ...options,
  });
}

function extrudedShapeGeometry(shape, radius, depthFactor = 0.22) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: radius * depthFactor,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: radius * 0.055,
    bevelThickness: radius * 0.045,
    curveSegments: 8,
  });
  geometry.center();
  return geometry;
}

function createMapleLeafGeometry(radius) {
  const s = radius * 0.82;
  const shape = new THREE.Shape();
  const points = [
    [0, 1.2], [0.18, 0.65], [0.53, 0.86], [0.43, 0.38], [0.9, 0.54],
    [0.58, 0.1], [0.77, -0.08], [0.27, -0.2], [0.13, -0.8], [-0.13, -0.8],
    [-0.27, -0.2], [-0.77, -0.08], [-0.58, 0.1], [-0.9, 0.54], [-0.43, 0.38],
    [-0.53, 0.86], [-0.18, 0.65],
  ];
  shape.moveTo(points[0][0] * s, points[0][1] * s);
  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index][0] * s, points[index][1] * s);
  }
  shape.closePath();
  const geometry = extrudedShapeGeometry(shape, radius, 0.3);
  geometry.userData.kidsGalaxyMapleLeaf = true;
  return geometry;
}

function createHeartGeometry(radius) {
  const shape = new THREE.Shape();
  const s = radius * 1.05;
  shape.moveTo(0, -0.62 * s);
  shape.bezierCurveTo(-0.95 * s, -0.05 * s, -0.82 * s, 0.76 * s, -0.34 * s, 0.76 * s);
  shape.bezierCurveTo(-0.08 * s, 0.76 * s, 0, 0.53 * s, 0, 0.38 * s);
  shape.bezierCurveTo(0, 0.53 * s, 0.08 * s, 0.76 * s, 0.34 * s, 0.76 * s);
  shape.bezierCurveTo(0.82 * s, 0.76 * s, 0.95 * s, -0.05 * s, 0, -0.62 * s);
  shape.closePath();
  const geometry = extrudedShapeGeometry(shape, radius, 0.34);
  geometry.userData.kidsGalaxyFamilyHeart = true;
  return geometry;
}

function createFleurDeLisGeometry(radius) {
  const s = radius * 0.9;
  const shape = new THREE.Shape();
  const points = [
    [0, 1.12], [0.22, 0.64], [0.48, 0.78], [0.39, 0.42], [0.76, 0.2],
    [0.42, 0.12], [0.32, -0.13], [0.52, -0.32], [0.18, -0.3], [0.13, -0.78],
    [-0.13, -0.78], [-0.18, -0.3], [-0.52, -0.32], [-0.32, -0.13], [-0.42, 0.12],
    [-0.76, 0.2], [-0.39, 0.42], [-0.48, 0.78], [-0.22, 0.64],
  ];
  shape.moveTo(points[0][0] * s, points[0][1] * s);
  for (let index = 1; index < points.length; index += 1) {
    shape.lineTo(points[index][0] * s, points[index][1] * s);
  }
  shape.closePath();
  const geometry = extrudedShapeGeometry(shape, radius, 0.28);
  geometry.userData.kidsGalaxyFleurDeLis = true;
  return geometry;
}

function createJackOLanternGeometry(radius) {
  const geometry = createAsteroidGeometry('halloween', radius);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const orange = new THREE.Color(0xf27922);
  const glow = new THREE.Color(0xffd25a);

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) / radius;
    const y = position.getY(index) / radius;
    const z = position.getZ(index) / radius;
    const front = z > 0.68;
    const leftEye = front && y > 0.12 && y < 0.45 && x > -0.58 && x < -0.14;
    const rightEye = front && y > 0.12 && y < 0.45 && x > 0.14 && x < 0.58;
    const mouth = front && y > -0.45 && y < -0.12 && Math.abs(x) < 0.58;
    const color = leftEye || rightEye || mouth ? glow : orange;
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.userData.kidsGalaxyJackOLantern = true;
  return geometry;
}

export function createThemeBodyGeometry(style, radius = 0.16) {
  let geometry;
  if (style === 'pumpkin') geometry = createAsteroidGeometry('halloween', radius);
  else if (style === 'jack-o-lantern') geometry = createJackOLanternGeometry(radius);
  else if (style === 'snowball') geometry = createAsteroidGeometry('christmas', radius);
  else if (style === 'easter-egg' || style === 'golden-egg') {
    geometry = createAsteroidGeometry('easter', radius);
  } else if (style === 'maple-leaf') geometry = createMapleLeafGeometry(radius);
  else if (style === 'fleur-de-lis') geometry = createFleurDeLisGeometry(radius);
  else if (style === 'heart') geometry = createHeartGeometry(radius);
  else if (style === 'ornament' || style === 'gold-orb' || style === 'silver-orb') {
    geometry = new THREE.SphereGeometry(radius, 24, 18);
  } else {
    geometry = createAsteroidGeometry('default', radius);
  }
  geometry.userData.kidsGalaxyAsteroidStyle = style;
  return geometry;
}

export function createThemeBodyMaterial(style) {
  if (style === 'pumpkin') return createAsteroidMaterial('halloween');
  if (style === 'snowball') return createAsteroidMaterial('christmas');
  if (style === 'easter-egg') return createAsteroidMaterial('easter');
  if (style === 'golden-egg') {
    return physicalMaterial(0xffd35a, {
      vertexColors: true,
      roughness: 0.34,
      metalness: 0.08,
      clearcoat: 0.22,
    });
  }
  if (style === 'jack-o-lantern') {
    return physicalMaterial(0xffffff, {
      vertexColors: true,
      emissive: 0x5c1b00,
      emissiveIntensity: 0.34,
      roughness: 0.55,
    });
  }
  if (style === 'maple-leaf') return physicalMaterial(0xd82333, { roughness: 0.52 });
  if (style === 'fleur-de-lis') return physicalMaterial(0xf8fbff, { roughness: 0.44 });
  if (style === 'heart') return physicalMaterial(0xff8db7, { roughness: 0.46 });
  if (style === 'ornament') return physicalMaterial(0xffffff, { roughness: 0.31, clearcoat: 0.24 });
  if (style === 'gold-orb') return physicalMaterial(0xffcf55, { roughness: 0.28, metalness: 0.2 });
  if (style === 'silver-orb') return physicalMaterial(0xe4e9f2, { roughness: 0.25, metalness: 0.24 });
  if (style === 'red-rock') return physicalMaterial(0xc82835, { roughness: 0.76 });
  if (style === 'white-rock') return physicalMaterial(0xf2f5f8, { roughness: 0.78 });
  if (style === 'blue-rock') return physicalMaterial(0x2e69bc, { roughness: 0.75 });
  if (style === 'autumn-rock') return physicalMaterial(0xb65f32, { roughness: 0.82 });
  return createAsteroidMaterial('default');
}

export function instanceColorForThemeBody(style, index) {
  if (style === 'easter-egg') return easterEggColorFor(index);
  if (style === 'ornament') {
    const palette = [0xd62f3e, 0x2f9d58, 0xffd05a, 0xf6f8ff];
    return new THREE.Color(palette[Math.abs(index) % palette.length]);
  }
  if (style === 'maple-leaf') {
    const palette = [0xd82333, 0xb71f2d, 0xe13a45];
    return new THREE.Color(palette[Math.abs(index) % palette.length]);
  }
  return null;
}

export function themeBodyHasStem(style) {
  return style === 'pumpkin' || style === 'jack-o-lantern';
}
