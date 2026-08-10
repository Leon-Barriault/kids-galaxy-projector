import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const INNER_RADIUS = 1.28;
const OUTER_RADIUS = 2.2;

function normalizedRadius(radius) {
  return THREE.MathUtils.clamp(
    (radius - INNER_RADIUS) / (OUTER_RADIUS - INNER_RADIUS),
    0,
    1,
  );
}

function gaussian(value, centre, width) {
  const delta = (value - centre) / width;
  return Math.exp(-delta * delta * 0.5);
}

function radialTone(radius) {
  const t = normalizedRadius(radius);
  const brightMiddle = gaussian(t, 0.46, 0.19) * 0.11;
  const secondBand = gaussian(t, 0.73, 0.1) * 0.035;
  const edgeShade = Math.pow(Math.abs(t - 0.5) * 2, 1.35) * 0.085;
  const fineStrata =
    Math.sin(t * Math.PI * 16 + 0.4) * 0.01 +
    Math.sin(t * Math.PI * 37 - 0.8) * 0.004;
  return brightMiddle + secondBand - edgeShade + fineStrata;
}

function deterministicVariation(index, radius) {
  const value = Math.sin(index * 12.9898 + radius * 78.233) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * 0.045;
}

function selectedHueVariant(selected, radius, index, role) {
  const hsl = {};
  selected.getHSL(hsl);
  const band = radialTone(radius);
  const randomTone = deterministicVariation(index, radius);

  let saturationScale = 0.96;
  let saturationBias = 0.015;
  let lightnessOffset = band * 0.38 + randomTone;

  if (role === 'ice') {
    saturationScale = 0.93;
    saturationBias = 0.02;
    lightnessOffset += 0.055;
  } else if (role === 'rock') {
    saturationScale = 0.82;
    saturationBias = 0.01;
    lightnessOffset += -0.085 + band * 0.1;
  } else if (role === 'sparkle') {
    saturationScale = 0.9;
    saturationBias = 0.015;
    lightnessOffset += 0.12 + band * 0.15;
  }

  return new THREE.Color().setHSL(
    hsl.h,
    THREE.MathUtils.clamp(hsl.s * saturationScale + saturationBias, 0, 1),
    THREE.MathUtils.clamp(hsl.l + lightnessOffset, 0.055, 0.93),
  );
}

function roleFor(layer) {
  if (layer.userData?.kidsGalaxySaturnHaze) return 'sparkle';
  if (layer.userData?.kidsGalaxyRingParticleKind === 'rock') return 'rock';
  if (layer.userData?.kidsGalaxyRingParticleKind === 'ice') return 'ice';
  return 'dust';
}

function recolorPoints(layer, selected, role) {
  const position = layer.geometry?.getAttribute?.('position');
  const colors = layer.geometry?.getAttribute?.('color');
  if (!position || !colors) return 0;

  const colour = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const radius = Math.hypot(position.getX(index), position.getY(index));
    colour.copy(selectedHueVariant(selected, radius, index, role));
    colors.setXYZ(index, colour.r, colour.g, colour.b);
  }
  colors.needsUpdate = true;
  layer.userData.kidsGalaxySelectedRingHue = true;
  return position.count;
}

function recolorInstances(layer, selected, role) {
  if (!layer.isInstancedMesh || !layer.instanceColor) return 0;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const colour = new THREE.Color();

  for (let index = 0; index < layer.count; index += 1) {
    layer.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    const radius = Math.hypot(position.x, position.y);
    colour.copy(selectedHueVariant(selected, radius, index, role));
    layer.setColorAt(index, colour);
  }
  layer.instanceColor.needsUpdate = true;
  layer.userData.kidsGalaxySelectedRingHue = true;
  return layer.count;
}

function preserveRingColour(entity) {
  const ring = entity.decorations?.find(
    (decoration) => decoration.userData?.kidsGalaxySaturnParticleRing,
  );
  if (!ring) return false;

  const selected = new THREE.Color(entity.ringColor);
  let recolored = 0;
  ring.children.forEach((layer) => {
    const role = roleFor(layer);
    if (layer.isPoints) recolored += recolorPoints(layer, selected, role);
    else if (layer.isInstancedMesh) recolored += recolorInstances(layer, selected, role);
  });

  ring.userData.kidsGalaxyRingColorFidelity = true;
  ring.userData.kidsGalaxySelectedRingColor = entity.ringColor.toLowerCase();
  ring.userData.kidsGalaxyRingColorTreatment = 'selected-hue-radial-variants';
  ring.userData.kidsGalaxyRecoloredParticleCount = recolored;
  return recolored > 0;
}

/**
 * Keep the accepted Saturn geometry/composition intact while making the colour
 * chosen on the kid tablet the unmistakable dominant hue. Ice, dust, rocks and
 * sparkles vary only in saturation/lightness around that selected hue; they no
 * longer get neutralised toward grey/white.
 */
export function installRingColorFidelity() {
  if (PlanetEntity.prototype.addPlanetRing?.kidsGalaxyRingColorFidelity) return;
  const previousAddPlanetRing = PlanetEntity.prototype.addPlanetRing;

  function colorFaithfulRing() {
    previousAddPlanetRing.call(this);
    preserveRingColour(this);
  }

  colorFaithfulRing.kidsGalaxyRingColorFidelity = true;
  PlanetEntity.prototype.addPlanetRing = colorFaithfulRing;
}
