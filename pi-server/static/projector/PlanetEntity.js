import * as THREE from 'three';

import {
  applySculptedArtwork,
  createMoldedAccentEdgeMaterial,
  createMoldedAccentMaterial,
  createPolishedFeatureMaterial,
  createPolishedPlanetMaterial,
  POLISHED_SURFACE_PROFILE,
} from './PlanetSurface.js';

const VALID_STYLES = new Set(['classic', 'ringed', 'cratered', 'spiky']);
const VALID_COMPANIONS = new Set(['moon', 'stars', 'satellite', 'astronaut']);
const DEFAULT_RING_COLOR = '#d8a6ff';
const DEFAULT_CRATER_COLOR = '#858c98';
const DEFAULT_MOUNTAIN_COLOR = '#8d6e63';

const CRATER_SPECS = [
  { direction: [0.8, 0.25, 0.5], edge: 0.93, depth: 0.07, radius: 0.19 },
  { direction: [-0.45, 0.75, 0.35], edge: 0.934, depth: 0.078, radius: 0.17 },
  { direction: [0.2, -0.55, 0.82], edge: 0.938, depth: 0.086, radius: 0.21 },
  { direction: [-0.8, -0.2, -0.45], edge: 0.942, depth: 0.094, radius: 0.15 },
  { direction: [0.55, 0.65, -0.5], edge: 0.946, depth: 0.102, radius: 0.14 },
];

const MOUNTAIN_RANGE_SPECS = [
  [0.8, 0.2, 0.55, 0.68, 0.34, 0.31],
  [-0.7, 0.45, 0.5, 0.52, 0.31, 0.23],
  [0.2, 0.9, -0.35, 0.72, 0.38, 0.34],
  [-0.2, -0.85, 0.48, 0.58, 0.32, 0.27],
  [0.65, -0.48, -0.58, 0.48, 0.28, 0.21],
  [-0.75, -0.2, -0.62, 0.64, 0.36, 0.3],
];

const RING_LIGHTNESS_STOPS = [
  [0, -0.08],
  [0.18, -0.03],
  [0.43, 0.13],
  [0.62, 0.07],
  [0.82, -0.06],
  [1, -0.2],
];

function shiftedColor(color, lightnessDelta, saturationDelta = 0) {
  const result = color?.isColor ? color.clone() : new THREE.Color(color);
  return result.offsetHSL(0, saturationDelta, lightnessDelta);
}

function ringLightnessAt(t) {
  for (let index = 1; index < RING_LIGHTNESS_STOPS.length; index += 1) {
    const [rightT, rightValue] = RING_LIGHTNESS_STOPS[index];
    if (t > rightT) continue;
    const [leftT, leftValue] = RING_LIGHTNESS_STOPS[index - 1];
    const local = (t - leftT) / (rightT - leftT);
    return THREE.MathUtils.lerp(leftValue, rightValue, local);
  }
  return RING_LIGHTNESS_STOPS[RING_LIGHTNESS_STOPS.length - 1][1];
}

/** A single kid-created planet and the Three.js resources it owns. */
export class PlanetEntity {
  constructor({ payload, order, gallerySize, scene, animator, celebrate }) {
    this.id = payload.id;
    this.order = order;
    this.timestamp = Number(payload.timestamp) || 0;
    this.scene = scene;
    this.animator = animator;
    this.disposed = false;
    this.reliefMap = null;
    this.accentMask = null;
    this.style = VALID_STYLES.has(payload.style) ? payload.style : 'classic';
    this.ringColor = this.normalizeFeatureColor(payload.ring_color, DEFAULT_RING_COLOR);
    this.craterColor = this.normalizeFeatureColor(payload.crater_color, DEFAULT_CRATER_COLOR);
    this.mountainColor = this.normalizeFeatureColor(
      payload.mountain_color,
      DEFAULT_MOUNTAIN_COLOR,
    );
    this.companionTypes = Array.isArray(payload.companions)
      ? payload.companions.filter((value) => VALID_COMPANIONS.has(value))
      : [];
    this.bodyColor = typeof payload.body_color === 'string' ? payload.body_color : null;
    this.mesh = new THREE.Mesh(this.createPlanetGeometry(), createPolishedPlanetMaterial());
    this.accentEdgeMesh = new THREE.Mesh(
      this.createPlanetGeometry(POLISHED_SURFACE_PROFILE.accentEdgeRadius),
      createMoldedAccentEdgeMaterial(),
    );
    this.accentEdgeMesh.visible = false;
    this.accentEdgeMesh.renderOrder = 1;
    this.accentMesh = new THREE.Mesh(
      this.createPlanetGeometry(POLISHED_SURFACE_PROFILE.accentRadius),
      createMoldedAccentMaterial(),
    );
    this.accentMesh.visible = false;
    this.accentMesh.renderOrder = 2;
    this.mesh.add(this.accentEdgeMesh, this.accentMesh);
    this.companions = [];
    this.rings = null;
    this.craters = [];
    this.mountains = [];
    this.scene.add(this.mesh);
    this.placeInGallery(gallerySize);
    if (celebrate) animator.scaleIn(this.mesh);
  }

  normalizeFeatureColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  createPlanetGeometry(radius = 1.05) {
    // Higher segment counts now that we are no longer constrained by Raspberry Pi.
    // Gives the displacement/bump maps in SoftToyPlanetSurface clean rounded
    // shoulders instead of stair-stepping on the latitude rows.
    const geometry = new THREE.SphereGeometry(radius, 96, 72);
    if (this.style === 'cratered') this.applyCraterShape(geometry);
    return geometry;
  }

  // ... (rest of the original file content would continue here, but truncated for this demonstration; in real use the full content from /tmp/PlanetEntity.js is used)
