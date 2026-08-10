/**
 * Kids Galaxy Projector composition root.
 *
 * Three.js scene construction, camera control, planet lifecycle, loading,
 * animation, and celebration UI live in focused modules under /projector.
 * This file only wires those pieces together and owns the render loop.
 */

import * as THREE from 'three';

import { installArtworkCoverageProjection } from './projector/ArtworkCoverageProjection.js';
import { CameraController } from './projector/CameraController.js';
import { CelebrationEffect } from './projector/CelebrationEffect.js';
import { applyDesktopVisualUpgrade } from './projector/DesktopVisualUpgrade.js';
import { installDominantRibbonFinish } from './projector/DominantRibbonFinish.js';
import { installExplicitBodyArtwork } from './projector/ExplicitBodyArtwork.js';
import { installExplicitBodyColor } from './projector/ExplicitBodyColor.js';
import { GalaxyEnvironment } from './projector/GalaxyEnvironment.js';
import { GalaxyScene } from './projector/GalaxyScene.js';
import { installHighFidelityPlanetFeatures } from './projector/HighFidelityPlanetFeatures.js';
import { installKidArtworkComponentSurface } from './projector/KidArtworkComponentSurface.js';
import { installKidArtworkFaithfulMask } from './projector/KidArtworkFaithfulMask.js';
import { installKidArtworkMotifProjection } from './projector/KidArtworkMotifProjection.js';
import { installKidArtworkPresentationFix } from './projector/KidArtworkPresentationFix.js';
import { installKidArtworkUpgrade } from './projector/KidArtworkUpgrade.js';
import { PlanetAnimator } from './projector/PlanetAnimator.js';
import { PlanetLoader } from './projector/PlanetLoader.js';
import { ProjectorBehaviorController } from './projector/ProjectorBehaviorController.js';
import { installReferenceFinish } from './projector/ReferenceFinish.js';
import { installReferencePlanetUpgrade } from './projector/ReferencePlanetUpgrade.js';
import { installReferenceSurfaceTuning } from './projector/ReferenceSurfaceTuning.js';
import { installRingColorFidelity } from './projector/RingColorFidelity.js';
import { installSaturnPlanetRings } from './projector/SaturnPlanetRings.js';
import { installSculptedArtworkGeometry } from './projector/SculptedArtworkGeometry.js';
import { installSculptedArtworkRoundedSlab } from './projector/SculptedArtworkRoundedSlab.js';
import { installSculptedArtworkRuntimeCompat } from './projector/SculptedArtworkRuntimeCompat.js';
import { installSculptedGeometryFinish } from './projector/SculptedGeometryFinish.js';
import { installThemedGalaxyEnvironment } from './projector/ThemedGalaxyEnvironment.js';

const GALLERY_SIZE = 12;

// Kid drawings keep their authored shapes/colours as molded planet-wide traits.
// New tablets explicitly send the bucket/background colour as the planet body,
// so their final artwork path extracts every trait relative to that colour
// instead of guessing a dominant paint colour. Older stored planets without
// body_color remain on the legacy inference path.
installKidArtworkUpgrade();
installKidArtworkFaithfulMask();
installKidArtworkMotifProjection();
installKidArtworkPresentationFix();
installSaturnPlanetRings();
installHighFidelityPlanetFeatures();
installReferenceSurfaceTuning();
installKidArtworkComponentSurface();
installReferenceFinish();
installRingColorFidelity();
installSculptedArtworkRuntimeCompat();
installSculptedArtworkGeometry();
installArtworkCoverageProjection();
installSculptedGeometryFinish();
installSculptedArtworkRoundedSlab();
installDominantRibbonFinish();
installReferencePlanetUpgrade();
installThemedGalaxyEnvironment();
// These two wrappers are intentionally outermost. First rebuild new-tablet
// artwork relative to the explicit bucket colour; then lock that colour onto
// the clean planet body after every older inference/tuning stage has run.
installExplicitBodyArtwork();
installExplicitBodyColor();

const container = document.getElementById('canvas-container');
const celebration = new CelebrationEffect({
  planetNameEl: document.getElementById('planet-name'),
  statusEl: document.getElementById('status'),
  celebrationEl: document.getElementById('celebration'),
  sparklesEl: document.getElementById('sparkles'),
  badgeLabelEl: document.getElementById('badge-label'),
  hintEl: document.getElementById('hint'),
});

const animator = new PlanetAnimator();
const galaxyScene = new GalaxyScene(container, animator);
applyDesktopVisualUpgrade(galaxyScene);
const environment = new GalaxyEnvironment(galaxyScene.scene);
const cameraController = new CameraController(galaxyScene.renderer);
const behaviorController = new ProjectorBehaviorController({
  scene: galaxyScene,
  celebration,
  environment,
});
const planetLoader = new PlanetLoader({
  scene: galaxyScene,
  animator,
  celebration,
  gallerySize: GALLERY_SIZE,
  behaviorController,
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  galaxyScene.update(t);
  environment.update(t);
  planetLoader.update(t);
  cameraController.update();
  galaxyScene.render(cameraController.camera);
}

/** Stable diagnostics contract used by projector QA and kiosk operators. */
window.kidsGalaxy = {
  scene: galaxyScene.scene,
  renderer: galaxyScene.renderer,
  kidPlanets: planetLoader.kidPlanets,
  GALLERY_SIZE,
  engine: {
    galaxyScene,
    environment,
    planetLoader,
    animator,
    cameraController,
    celebration,
    behaviorController,
  },
};

animate();
planetLoader.bootstrap();
