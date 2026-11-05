/**
 * Kids Galaxy Projector composition root.
 *
 * Three.js scene construction, camera control, planet lifecycle, loading,
 * animation, and celebration UI live in focused modules under /projector.
 * This file only wires those pieces together and owns the render loop.
 */

import * as THREE from 'three';

import {
  ASTRONAUT_VARIANTS,
  installFriendlyAstronautOptions,
} from './projector/AstronautCompanionOptions.js';
import { CameraController } from './projector/CameraController.js';
import { CelebrationEffect } from './projector/CelebrationEffect.js';
import { applyDesktopVisualUpgrade } from './projector/DesktopVisualUpgrade.js';
import { GalaxyEnvironment } from './projector/GalaxyEnvironment.js';
import { GalaxyScene } from './projector/GalaxyScene.js';
import { installHighFidelityPlanetFeatures } from './projector/HighFidelityPlanetFeatures.js';
import { installManifestStrokeSurface } from './projector/ManifestStrokeSurface.js';
import { PlanetAnimator } from './projector/PlanetAnimator.js';
import { PlanetLoader } from './projector/PlanetLoader.js';
import { installPlanetRenderPipeline } from './projector/PlanetRenderPipeline.js';
import { installPolarMagnetSweep3D } from './projector/PolarMagnetSweep3D.js';
import { ProjectorBehaviorController } from './projector/ProjectorBehaviorController.js';
import {
  pageBuildOf,
  ProjectorBuildWatcher,
  sessionStorageOrNull,
} from './projector/ProjectorBuildWatcher.js';
import { ProjectorSnapshotPublisher } from './projector/ProjectorSnapshotPublisher.js';
import { ShuttlePointer } from './projector/ShuttlePointer.js';
import { installReferenceFinish } from './projector/ReferenceFinish.js';
import { installReferencePlanetUpgrade } from './projector/ReferencePlanetUpgrade.js';
import { installReferenceSurfaceTuning } from './projector/ReferenceSurfaceTuning.js';
import { installRingColorFidelity } from './projector/RingColorFidelity.js';
import { installSaturnPlanetRings } from './projector/SaturnPlanetRings.js';
import { installThemedGalaxyEnvironment } from './projector/ThemedGalaxyEnvironment.js';
import { installVisualRefinement } from './projector/VisualRefinement.js';

const GALLERY_SIZE = 12;

function installVisualRefinementStage() {
  installVisualRefinement();
  installFriendlyAstronautOptions();
}


// Every planet is rendered from its drawing manifest by ManifestStrokeSurface,
// which replaces the body material and geometry wholesale, so older surface
// stages that ran before it did work nobody saw. Five were removed earlier; the
// nine kid-artwork, sculpted, stroke-projection and soft-toy stages followed
// once measurement showed the finished surface byte-for-byte identical without
// them and planet build time about 45% lower. Every stage below still changes
// something on screen - rings, craters, mountains, companions, themes - and the
// two reference stages now only finish the Saturn ring.
const PLANET_RENDER_STAGES = Object.freeze([
  { name: 'saturn-planet-rings', install: installSaturnPlanetRings },
  { name: 'high-fidelity-planet-features', install: installHighFidelityPlanetFeatures },
  { name: 'reference-surface-tuning', install: installReferenceSurfaceTuning },
  { name: 'reference-finish', install: installReferenceFinish },
  { name: 'ring-color-fidelity', install: installRingColorFidelity },
  { name: 'reference-planet-upgrade', install: installReferencePlanetUpgrade },
  { name: 'themed-galaxy-environment', install: installThemedGalaxyEnvironment },
  { name: 'visual-refinement', install: installVisualRefinementStage },
]);

const installedPlanetRenderStages = installPlanetRenderPipeline(PLANET_RENDER_STAGES);
// The manifest renderer owns every planet's body. Installing it after the
// stages makes it the outermost applyTexture wrapper; it then builds the surface
// maps off the main thread (ManifestMapsClient) and finishes the planet when
// they arrive, so an arriving drawing no longer freezes the wall.
//
// The internal gap fill used to wrap this as a further stage. It runs inside
// buildManifestMaps now, before the relief pass. As a post-processor it had to
// reach back into finished textures, and when relief became geometry the
// displacementMap it reached for stopped existing - so it silently stopped
// bridging trenches while still reporting success, because every access was
// null-guarded. Filling ownership before relief is computed means there is
// nothing left to correct afterwards.
installManifestStrokeSurface();
// The polar twist, applied after the manifest renderer has produced the final
// embossed sphere: every latitude ring is rotated around the real north/south
// axis, by an amount that grows from pole to pole. Colour, relief and the raised
// bevel geometry are all carried round together, because this deforms the
// finished mesh rather than the flat texture.
//
// It sits outside PLANET_RENDER_STAGES because it is not a surface stage - it
// does not decide what the planet looks like, it deforms whatever the surface
// stages produced, and it must run last - as a surface-ready hook, since the
// surface now arrives asynchronously. Keeping it out also leaves the pipeline
// diagnostics the acceptance scripts read unchanged.
installPolarMagnetSweep3D();

const container = document.getElementById('canvas-container');
const celebration = new CelebrationEffect({
  planetNameEl: document.getElementById('planet-name'),
  statusEl: document.getElementById('status'),
  celebrationEl: document.getElementById('celebration'),
  sparklesEl: document.getElementById('sparkles'),
  badgeLabelEl: document.getElementById('badge-label'),
  hintEl: document.getElementById('hint'),
});

// The wall hides the system cursor; a shuttle follows the mouse instead.
const shuttlePointer = new ShuttlePointer({ element: document.getElementById('shuttle-pointer') });
shuttlePointer.start();

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
// Reloads the wall once when the server starts serving a newer projector, so an
// update reaches the screen without anyone touching the kiosk.
const buildWatcher = new ProjectorBuildWatcher({
  pageBuild: pageBuildOf(document),
  reload: () => window.location.reload(),
  storage: sessionStorageOrNull(),
});
const planetLoader = new PlanetLoader({
  scene: galaxyScene,
  animator,
  celebration,
  gallerySize: GALLERY_SIZE,
  behaviorController,
  snapshotPublisher,
  buildWatcher,
});
// The manager tablet chooses how drawings are wrapped onto planets (classic or
// front-view). A change rebuilds the wall's planets from their stored drawings.
behaviorController.onPlanetRenderingChange((rendering) =>
  planetLoader.setPlanetRendering(rendering),
);

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
    buildWatcher,
    shuttlePointer,
  },
};

animate();
planetLoader.bootstrap();
