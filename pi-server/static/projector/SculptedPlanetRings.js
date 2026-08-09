import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';
import { createPolishedFeatureMaterial } from './PlanetSurface.js';

const INNER_RADIUS = 1.18;
const OUTER_RADIUS = 2.1;
const RING_DEPTH = 0.14;
const BEVEL_SIZE = 0.036;
const BEVEL_THICKNESS = 0.027;
const SEGMENTS = 320;
const BAND_COUNT = 18;
const HAIRLINE_BANDS = [0.13, 0.24, 0.36, 0.66, 0.79, 0.9];

function shiftedColor(color, lightnessDelta, saturationDelta = 0) {
  const result = color?.isColor ? color.clone() : new THREE.Color(color);
  return result.offsetHSL(0, saturationDelta, lightnessDelta);
}

function radialTone(t) {
  const edge = Math.pow(Math.abs(t - 0.5) * 2, 1.45);
  const middleGlow = (1 - edge) * 0.17;
  const edgeShade = edge * -0.17;
  const strata =
    Math.sin(t * Math.PI * 14 + 0.7) * 0.018 +
    Math.sin(t * Math.PI * 30 - 0.4) * 0.007;
  return middleGlow + edgeShade + strata - 0.012;
}

function outlineRadius(entity, angle, radius, inner) {
  const seed = entity.animator.hashId(`${entity.id}-sculpted-ring`);
  const phaseA = entity.seededUnit(seed, 2) * Math.PI * 2;
  const phaseB = entity.seededUnit(seed, 10) * Math.PI * 2;
  if (inner) {
    return (
      radius +
      Math.sin(angle * 2 + phaseA + 0.45) * 0.008 +
      Math.sin(angle * 5 + phaseB) * 0.003
    );
  }
  return (
    radius +
    Math.sin(angle * 2 + phaseA) * 0.016 +
    Math.sin(angle * 5 + phaseB + 0.35) * 0.006
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

function ringWobbleAt(entity, angle, t) {
  const inner = outlineRadius(entity, angle, INNER_RADIUS, true) - INNER_RADIUS;
  const outer = outlineRadius(entity, angle, OUTER_RADIUS, false) - OUTER_RADIUS;
  return THREE.MathUtils.lerp(inner, outer, t);
}

function warpBandGeometry(entity, geometry, verticalOffset = 0) {
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const radius = Math.hypot(x, y);
    const angle = Math.atan2(y, x);
    const t = THREE.MathUtils.clamp(
      (radius - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS),
      0,
      1,
    );
    const warpedRadius = radius + ringWobbleAt(entity, angle, t);
    const scale = warpedRadius / Math.max(radius, 0.001);
    const microRelief =
      Math.sin(t * Math.PI * 18 + 0.4) * 0.0022 +
      Math.sin(t * Math.PI * 34) * 0.0008;
    position.setXYZ(index, x * scale, y * scale, verticalOffset + microRelief);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
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
    bevelSegments: 8,
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
    const faceTone = z > RING_DEPTH * 0.2 ? 0.025 : z < -RING_DEPTH * 0.2 ? -0.09 : -0.055;
    const color = shiftedColor(base, radialTone(t) + faceTone, -0.018);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  geometry.userData.kidsGalaxySculptedRing = true;
  geometry.userData.kidsGalaxyRealisticGradientRing = true;
  geometry.userData.kidsGalaxyRingGradient = true;
  geometry.userData.kidsGalaxyRingWobble = true;
  geometry.userData.kidsGalaxyRingWobbleTarget = 'planet-decoration';
  geometry.userData.kidsGalaxyRingBeveled = true;
  geometry.userData.innerRadius = INNER_RADIUS;
  geometry.userData.outerRadius = OUTER_RADIUS;
  geometry.userData.thickness = RING_DEPTH;
  geometry.userData.wobbleAmplitude = 0.022;
  geometry.userData.radialSegments = SEGMENTS;
  geometry.userData.radialBandCount = BAND_COUNT;
  return geometry;
}

function createBandMaterial(base, t, extraTone = 0) {
  const color = shiftedColor(base, radialTone(t) + extraTone, -0.02);
  if (Math.abs(t - 0.5) < 0.2) color.lerp(new THREE.Color(0xffffff), 0.045);
  return createPolishedFeatureMaterial(color, {
    roughness: 0.45,
    clearcoat: 0.13,
    metalness: 0.002,
    side: THREE.DoubleSide,
  });
}

function addRadialBanding(entity, ring) {
  const base = new THREE.Color(entity.ringColor);
  const width = OUTER_RADIUS - INNER_RADIUS;
  const topZ = RING_DEPTH / 2 + 0.004;

  for (let index = 0; index < BAND_COUNT; index += 1) {
    const startT = index / BAND_COUNT;
    const endT = (index + 1) / BAND_COUNT;
    const middleT = (startT + endT) / 2;
    const inner = INNER_RADIUS + width * startT;
    const outer = INNER_RADIUS + width * endT;
    const geometry = warpBandGeometry(
      entity,
      new THREE.RingGeometry(inner, outer, SEGMENTS, 1),
      topZ,
    );
    geometry.userData.kidsGalaxyRingBand = true;
    geometry.userData.bandPosition = middleT;
    const band = new THREE.Mesh(geometry, createBandMaterial(base, middleT));
    band.receiveShadow = true;
    band.userData.kidsGalaxyRingBand = true;
    ring.add(band);
  }

  HAIRLINE_BANDS.forEach((t, index) => {
    const radius = INNER_RADIUS + width * t;
    const halfWidth = index % 2 === 0 ? 0.009 : 0.006;
    const geometry = warpBandGeometry(
      entity,
      new THREE.RingGeometry(radius - halfWidth, radius + halfWidth, SEGMENTS, 1),
      topZ + 0.0025,
    );
    geometry.userData.kidsGalaxyRingHairline = true;
    const line = new THREE.Mesh(geometry, createBandMaterial(base, t, -0.095));
    line.receiveShadow = true;
    line.userData.kidsGalaxyRingHairline = true;
    ring.add(line);
  });

  ring.userData.kidsGalaxyRingBandLayers = BAND_COUNT;
  ring.userData.kidsGalaxyRingHairlines = HAIRLINE_BANDS.length;
}

function sculptedAddPlanetRing() {
  const material = createPolishedFeatureMaterial(0xffffff, {
    roughness: 0.48,
    clearcoat: 0.12,
    metalness: 0.002,
    side: THREE.DoubleSide,
  });
  material.vertexColors = true;
  material.needsUpdate = true;

  const ring = new THREE.Mesh(createSculptedRingGeometry(this), material);
  ring.castShadow = true;
  ring.receiveShadow = true;
  ring.userData.kidsGalaxySculptedRing = true;
  ring.userData.kidsGalaxyRealisticGradientRing = true;
  addRadialBanding(this, ring);
  ring.rotation.x = Math.PI / 2.55;
  ring.rotation.z = 0.18;
  this.scene.add(ring);
  this.decorations.push(ring);
}

/** Install the smooth, continuous, radially graded ring implementation. */
export function installSculptedPlanetRings() {
  if (PlanetEntity.prototype.addPlanetRing === sculptedAddPlanetRing) return;
  PlanetEntity.prototype.addPlanetRing = sculptedAddPlanetRing;
}
