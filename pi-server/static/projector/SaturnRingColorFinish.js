import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const ICE_COLOR_STRENGTH = 0.72;
const DUST_COLOR_STRENGTH = 0.68;
const ROCK_COLOR_STRENGTH = 0.58;
const SPARKLE_COLOR_STRENGTH = 0.66;

function layerStrength(layer) {
  if (layer.userData?.kidsGalaxyRingParticleKind === 'rock') {
    return ROCK_COLOR_STRENGTH;
  }
  if (layer.userData?.kidsGalaxyRingParticleKind === 'ice') {
    return ICE_COLOR_STRENGTH;
  }
  if (layer.userData?.kidsGalaxySaturnHaze) {
    return SPARKLE_COLOR_STRENGTH;
  }
  return DUST_COLOR_STRENGTH;
}

function retintAttribute(attribute, selected, strength) {
  if (!attribute?.count) return 0;
  const original = new THREE.Color();
  const tinted = new THREE.Color();

  for (let index = 0; index < attribute.count; index += 1) {
    original.setRGB(
      attribute.getX(index),
      attribute.getY(index),
      attribute.getZ(index),
      THREE.LinearSRGBColorSpace,
    );

    // Keep the particle's existing radial brightness/ice-vs-rock variation,
    // but anchor its actual hue strongly to the color selected on the tablet.
    // This changes only color: positions, sizes, gaps, density and rotation are
    // untouched so the accepted Saturn composition remains exactly the same.
    tinted.copy(original).lerp(selected, strength);
    attribute.setXYZ(index, tinted.r, tinted.g, tinted.b);
  }

  attribute.needsUpdate = true;
  return attribute.count;
}

function retintLayer(layer, selected) {
  const strength = layerStrength(layer);
  let samples = 0;

  if (layer.instanceColor) {
    samples += retintAttribute(layer.instanceColor, selected, strength);
  }

  const vertexColors = layer.geometry?.getAttribute?.('color');
  if (vertexColors) {
    samples += retintAttribute(vertexColors, selected, strength);
  }

  layer.userData.kidsGalaxyTabletRingColorApplied = true;
  layer.userData.kidsGalaxyRingColorStrength = strength;
  return samples;
}

function applySelectedRingColor(entity, ring) {
  if (!ring?.userData?.kidsGalaxySaturnParticleRing) return false;

  const selected = new THREE.Color(entity.ringColor);
  let samples = 0;
  ring.children.forEach((layer) => {
    samples += retintLayer(layer, selected);
  });

  ring.userData.kidsGalaxyTabletRingColorApplied = true;
  ring.userData.kidsGalaxySelectedRingColor = entity.ringColor;
  ring.userData.kidsGalaxyRingColorSampleCount = samples;
  ring.userData.kidsGalaxyRingColorPolicy =
    'tablet-hue-with-natural-ice-rock-luminance';
  ring.userData.kidsGalaxyRingIceColorStrength = ICE_COLOR_STRENGTH;
  ring.userData.kidsGalaxyRingDustColorStrength = DUST_COLOR_STRENGTH;
  ring.userData.kidsGalaxyRingRockColorStrength = ROCK_COLOR_STRENGTH;
  return samples > 0;
}

/**
 * Preserve the tablet-selected ring color without changing the accepted
 * Saturn-like particle shape/composition.
 */
export function installSaturnRingColorFinish() {
  if (PlanetEntity.prototype.addPlanetRing?.kidsGalaxySaturnRingColorFinish) {
    return;
  }

  const previousAddPlanetRing = PlanetEntity.prototype.addPlanetRing;

  function colorFinishedPlanetRing() {
    const before = this.decorations.length;
    previousAddPlanetRing.call(this);
    this.decorations.slice(before).forEach((decoration) => {
      applySelectedRingColor(this, decoration);
    });
  }

  colorFinishedPlanetRing.kidsGalaxySaturnRingColorFinish = true;
  PlanetEntity.prototype.addPlanetRing = colorFinishedPlanetRing;
}
