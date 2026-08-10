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
import { installPlanetRenderPipeline } from './projector/PlanetRenderPipeline.js';
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
import { installStrokeWrapProjection } from './projector/StrokeWrapProjection.js';
import { installThemedGalaxyEnvironment } from './projector/ThemedGalaxyEnvironment.js';
import { installVisualRefinement } from './projector/VisualRefinement.js';

const GALLERY_SIZE = 12;

// Kid drawings keep their authored shapes/colours as molded planet-wide traits.
// New tablets explicitly send the bucket/background colour as the planet body.
// SculptedArtworkGeometry reads that colour directly: matching pixels are the
// body and every other kid-selected colour is artwork, regardless of area.
// Older stored planets without body_color remain on the legacy inference path.
//
// Order is part of the rendering contract. The legacy installers still extend
// PlanetEntity at runtime, so every stage is declared here as data and installed
// through one composition point. Move a stage only with projector acceptance
// coverage proving the resulting behavior is intentional.
const PLANET_RENDER_STAGES = Object.freeze([
  { name: 'kid-artwork-upgrade', install: installKidArtworkUpgrade },
  { name: 'kid-artwork-faithful-mask', install: installKidArtworkFaithfulMask },
  { name: 'kid-artwork-motif-projection', install: installKidArtworkMotifProjection },
  { name: 'kid-artwork-presentation-fix', install: installKidArtworkPresentationFix },
  { name: 'saturn-planet-rings', install: installSaturnPlanetRings },
  { name: 'high-fidelity-planet-features', install: installHighFidelityPlanetFeatures },
  { name: 'reference-surface-tuning', install: installReferenceSurfaceTuning },
  { name: 'kid-artwork-component-surface', install: installKidArtworkComponentSurface },
  { name: 'reference-finish', install: installReferenceFinish },
  { name: 'ring-color-fidelity', install: installRingColorFidelity },
  { name: 'sculpted-artwork-runtime-compat', install: installSculptedArtworkRuntimeCompat },
  { name: 'sculpted-artwork-geometry', install: installSculptedArtworkGeometry },
  { name: 'artwork-coverage-projection', install: installArtworkCoverageProjection },
  { name: 'sculpted-geometry-finish', install: installSculptedGeometryFinish },
  { name: 'sculpted-artwork-rounded-slab', install: installSculptedArtworkRoundedSlab },
  { name: 'dominant-ribbon-finish', install: installDominantRibbonFinish },
  { name: 'reference-planet-upgrade', install: installReferencePlanetUpgrade },
  { name: 'themed-galaxy-environment', install: installThemedGalaxyEnvironment },
  // Outermost for the final body material. No colour inference happens here:
  // the core sculptor has already separated body pixels from authored traits.
  { name: 'explicit-body-color', install: installExplicitBodyColor },
  // Reshapes authoritative sculpted art, deepens installed crater geometry,
  // and replaces the astronaut companion.
  { name: 'visual-refinement', install: installVisualRefinement },
  // Deliberately last for new tablet planets: the selected background remains
  // the sphere body while only extracted kid strokes wind around the globe.
  { name: 'stroke-wrap-projection', install: installStrokeWrapProjection },
]);

const installedPlanetRenderStages = installPlanetRenderPipeline(PLANET_RENDER_STAGES);

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
  renderPipeline: installedPlanetRenderStages,
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