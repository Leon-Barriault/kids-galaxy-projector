import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';
import { createPolishedFeatureMaterial } from './PlanetSurface.js';

const INNER_RADIUS = 1.18;
const OUTER_RADIUS = 2.1;
const RING_DEPTH = 0.125;
const BEVEL_SIZE = 0.032;
const BEVEL_THICKNESS = 0.024;
const SEGMENTS = 256;

function shiftedColor(color, lightnessDelta, saturationDelta = 0) {
  const result = color?.isColor ? color.clone() : new THREE.Color(color);
  return result.offsetHSL(0, saturationDelta, lightnessDelta);
}

function radialLightness(t) {
  const crown = Math.sin(Math.PI * t) * 0.115;
  return -0.05 + crown - t * 0.018;
}

function outlineRadius(entity, angle, radius, inner) {
  const seed = entity.animator.hashId(`${entity.id}-sculpted-ring`);
  const phaseA = entity.seededUnit(seed, 2) * Math.PI * 2;
  const phaseB = entity.seededUnit(seed, 10) * Math.PI * 2;
  if (inner) {
    return (
      radius +
      Math.sin(angle * 2 + phaseA + 0.45) * 0.009 +
      Math.sin(angle * 5 + phaseB) * 0.0035
    );
  }
  return (
    radius +
    Math.sin(angle * 2 + phaseA) * 0.019 +
    Math.sin(angle * 5 + phaseB + 0.35) * 0.007
  );
}

function traceLoop(path, entity, radius, clockwise) {
  for (let index = 0; index <= SEGMENTS; index += 1) {
    const fraction = index / SEGMENTS;
    const angle = (clockwise ? -fraction : fraction) * Math.PI * 2;
    const resolvedRadius = outlineRadius(entity, angle, radius, radius === INNER_RADIUS);
    const x = Math.cos(angle) * resolvedRadius;
    const y = Math.sin(angle) * resolvedRadius;
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

function createSculptedRingGeometry(entity) {
  const shape = new THREE.Shape();
  traceLoop(shape, entity, OUTER_RADIUS, false);

  const hole = new THREE.Path();
  traceLoop(hole, entity, INNER_RADIUS, true);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: RING_DEPTH,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 6,
    bevelSize: BEVEL_SIZE,
    bevelThickness: BEVEL_THICKNESS,
    curveSegments: SEGMENTS,
  });
  geometry.translate(0, 0, -RING_DEPTH / 2);

  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const base = new THREE.Color(entity.ringColor);
  for (let index = 0; index < position.count; index += 1) {
    const radius = Math.hypot(position.getX(index), position.getY(index));
    const t = THREE.MathUtils.clamp(
      (radius - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS),
      0,
      1,
    );
    const z = position.getZ(index);
    const faceTone = z > RING_DEPTH * 0.22 ? 0.04 : z < -RING_DEPTH * 0.22 ? -0.075 : -0.03;
    const color = shiftedColor(base, radialLightness(t) + faceTone, -0.022);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  geometry.userData.kidsGalaxySculptedRing = true;
  geometry.userData.kidsGalaxyRingGradient = true;
  geometry.userData.kidsGalaxyRingWobble = true;
  geometry.userData.kidsGalaxyRingWobbleTarget = 'planet-decoration';
  geometry.userData.kidsGalaxyRingBeveled = true;
  geometry.userData.innerRadius = INNER_RADIUS;
  geometry.userData.outerRadius = OUTER_RADIUS;
  geometry.userData.thickness = RING_DEPTH;
  geometry.userData.wobbleAmplitude = 0.026;
  geometry.userData.radialSegments = SEGMENTS;
  return geometry;
}

function sculptedAddPlanetRing() {
  const material = createPolishedFeatureMaterial(0xffffff, {
    roughness: 0.52,
    clearcoat: 0.13,
    side: THREE.DoubleSide,
  });
  material.vertexColors = true;
  material.needsUpdate = true;

  const ring = new THREE.Mesh(createSculptedRingGeometry(this), material);
  ring.castShadow = true;
  ring.receiveShadow = true;
  ring.userData.kidsGalaxySculptedRing = true;
  ring.rotation.x = Math.PI / 2.55;
  ring.rotation.z = 0.18;
  this.scene.add(ring);
  this.decorations.push(ring);
}

/** Install the smooth, solid toy-like ring implementation before planets load. */
export function installSculptedPlanetRings() {
  if (PlanetEntity.prototype.addPlanetRing === sculptedAddPlanetRing) return;
  PlanetEntity.prototype.addPlanetRing = sculptedAddPlanetRing;
}
