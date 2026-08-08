/**
 * Kids Galaxy Projector composition root.
 *
 * Three.js scene construction, camera control, planet lifecycle, loading,
 * animation, and celebration UI live in focused modules under /projector.
 * This file only wires those pieces together and owns the render loop.
 */

import * as THREE from 'three';

import { CameraController } from './projector/CameraController.js';
import { CelebrationEffect } from './projector/CelebrationEffect.js';
import { GalaxyScene } from './projector/GalaxyScene.js';
import { PlanetAnimator } from './projector/PlanetAnimator.js';
import { PlanetLoader } from './projector/PlanetLoader.js';

const GALLERY_SIZE = 12;

const container = document.getElementById('canvas-container');
const celebration = new CelebrationEffect({
  planetNameEl: document.getElementById('planet-name'),
  statusEl: document.getElementById('status'),
  celebrationEl: document.getElementById('celebration'),
  sparklesEl: document.getElementById('sparkles'),
});

const animator = new PlanetAnimator();
const galaxyScene = new GalaxyScene(container, animator);
const cameraController = new CameraController(galaxyScene.renderer);
const planetLoader = new PlanetLoader({
  scene: galaxyScene,
  animator,
  celebration,
  gallerySize: GALLERY_SIZE,
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  galaxyScene.update(t);
  planetLoader.update(t);
  cameraController.update();
  galaxyScene.render(cameraController.camera);
}

/**
 * Stable diagnostics contract used by scripts/check_projector.py and by kiosk
 * operators inspecting a live projector from the browser console.
 */
window.kidsGalaxy = {
  scene: galaxyScene.scene,
  renderer: galaxyScene.renderer,
  kidPlanets: planetLoader.kidPlanets,
  GALLERY_SIZE,
  engine: {
    galaxyScene,
    planetLoader,
    animator,
    cameraController,
    celebration,
  },
};

// Render before network bootstrap: a failed request must never leave a black
// projector screen.
animate();
planetLoader.bootstrap();
