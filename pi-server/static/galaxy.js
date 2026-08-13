/**
 * Kids Galaxy Projector composition root.
 *
 * Three.js scene construction, camera control, planet lifecycle, loading,
 * animation, and celebration UI live in focused modules under /projector.
 * This file only wires those pieces together and owns the render loop.
 */

import * as THREE from 'three';

import { installAreaFillSphericalProjection } from './projector/AreaFillSphericalProjection.js';
import { installArtworkCoverageProjection } from './projector/ArtworkCoverageProjection.js';
import {
  ASTRONAUT_VARIANTS,
  installFriendlyAstronautOptions,
} from './projector/AstronautCompanionOptions.js';
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
import { installManifestStrokeSurface } from './projector/ManifestStrokeSurface.js';
import { PlanetAnimator } from './projector/PlanetAnimator.js';
import { PlanetLoader } from './projector/PlanetLoader.js';
import { installPlanetRenderPipeline } from './projector/PlanetRenderPipeline.js';
import { ProjectorBehaviorController } from './projector/ProjectorBehaviorController.js';
import { ProjectorSnapshotPublisher } from './projector/ProjectorSnapshotPublisher.js';
import { installReferenceFinish } from './projector/ReferenceFinish.js';
import { installReferencePlanetUpgrade } from './projector/ReferencePlanetUpgrade.js';
import { installReferenceSurfaceTuning } from './projector/ReferenceSurfaceTuning.js';
import { installRingColorFidelity } from './projector/RingColorFidelity.js';
import { installSaturnPlanetRings } from './projector/SaturnPlanetRings.js';
import { installSoftToyPlanetSurface } from './projector/SoftToyPlanetSurface.js';
import { installSculptedArtworkGeometry } from './projector/SculptedArtworkGeometry.js';
import { installSculptedArtworkRoundedSlab } from './projector/SculptedArtworkRoundedSlab.js';
import { installSculptedArtworkRuntimeCompat } from './projector/SculptedArtworkRuntimeCompat.js';
import { installSculptedGeometryFinish } from './projector/SculptedGeometryFinish.js';
import { installStrokeLatitudeProjection } from './projector/StrokeLatitudeProjection.js';
import { installStrokeWrapProjection } from './projector/StrokeWrapProjection.js';
import { installThemedGalaxyEnvironment } from './projector/ThemedGalaxyEnvironment.js';
import { installVisualRefinement } from './projector/VisualRefinement.js';

const GALLERY_SIZE = 12;

function installVisualRefinementStage() {
  installVisualRefinement();
  installFriendlyAstronautOptions();
}

function installSphericalStrokeProjectionStage() {
  installStrokeWrapProjection();
  installStrokeLatitudeProjection();
  installAreaFillSphericalProjection();
}

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
  { name: 'explicit-body-color', install: installExplicitBodyColor },
  { name: 'visual-refinement', install: installVisualRefinementStage },
  { name: 'stroke-wrap-projection', install: installSphericalStrokeProjectionStage },
  { name: 'soft-toy-planet-surface', install: installSoftToyPlanetSurface },
]);

const installedPlanetRenderStages = installPlanetRenderPipeline(PLANET_RENDER_STAGES);
// Keep the long-standing pipeline diagnostics stable. The manifest renderer is
// an authoritative input adapter for new vector-aware tablet drawings rather
// than a replacement for the image-only compatibility pipeline. Installing it
// afterwards still makes it the outermost applyTexture wrapper, so manifest
// intent wins synchronously whenever a sidecar is present.
//
// The internal gap fill used to wrap this as a further stage. It runs inside
// buildManifestMaps now, before the relief pass. As a post-processor it had to
// reach back into finished textures, and when relief became geometry the
// displacementMap it reached for stopped existing - so it silently stopped
// bridging trenches while still reporting success, because every access was
// null-guarded. Filling ownership before relief is computed means there is
// nothing left to correct afterwards.
installManifestStrokeSurface();

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
const snapshotPublisher = new ProjectorSnapshotPublisher({ galaxyScene });
const planetLoader = new PlanetLoader({
  scene: galaxyScene,
  animator,
  celebration,
  gallerySize: GALLERY_SIZE,
  behaviorController,
  snapshotPublisher,
});

const timer = new THREE.Timer();

function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const t = timer.getElapsed();
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
  astronautVariants: ASTRONAUT_VARIANTS,
  engine: {
    galaxyScene,
    environment,
    planetLoader,
    animator,
    cameraController,
    celebration,
    behaviorController,
    snapshotPublisher,
  },
};

animate();
planetLoader.bootstrap();
