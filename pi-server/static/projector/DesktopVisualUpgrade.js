import * as THREE from 'three';

const MIN_AMBIENT_INTENSITY = 0.56;
const MIN_FILL_INTENSITY = 0.42;
const STUDIO_GROUND_COLOR = 0x52617f;
const STUDIO_AMBIENT_TARGET = new THREE.Color(0xd7e0f4);
const STUDIO_SKY_TARGET = new THREE.Color(0xe2eaff);

function preserveStudioFill(galaxyScene) {
  if (galaxyScene.ambientLight) {
    galaxyScene.ambientLight.intensity = Math.max(
      MIN_AMBIENT_INTENSITY,
      galaxyScene.ambientLight.intensity,
    );
    // Keep seasonal/theme tinting, but pull the nondirectional fill toward a
    // neutral studio source so saturated kid colours survive on the night side.
    galaxyScene.ambientLight.color.lerp(STUDIO_AMBIENT_TARGET, 0.34);
  }
  if (galaxyScene.fillLight) {
    galaxyScene.fillLight.intensity = Math.max(
      MIN_FILL_INTENSITY,
      galaxyScene.fillLight.intensity,
    );
    galaxyScene.fillLight.color.lerp(STUDIO_SKY_TARGET, 0.32);
    // The Raspberry-Pi-era ground colour was almost black. On a curved molded
    // piece that made every downward-facing bevel read like an ink outline.
    // A cool mid-value lower fill keeps physical depth without destroying hue.
    galaxyScene.fillLight.groundColor.setHex(STUDIO_GROUND_COLOR);
  }
}

/** Apply the high-quality rendering profile now that the projector runs from a laptop. */
export function applyDesktopVisualUpgrade(galaxyScene) {
  const { renderer, scene, sunLight } = galaxyScene;

  renderer.shadowMap.enabled = true;
  // PCFShadowMap, not PCFSoftShadowMap: the soft variant is deprecated as of
  // three r185, which warns and then silently uses this one anyway. Asking for
  // it directly changes nothing on screen and removes a warning that made a real
  // error harder to spot in the console.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.userData ??= {};
  renderer.userData.kidsGalaxyQualityProfile = 'laptop-high';
  renderer.userData.kidsGalaxyRealtimeShadows = true;
  renderer.userData.kidsGalaxyStudioFill = true;
  renderer.userData.kidsGalaxyStudioAmbientFloor = MIN_AMBIENT_INTENSITY;
  renderer.userData.kidsGalaxyStudioHemisphereFloor = MIN_FILL_INTENSITY;
  renderer.userData.kidsGalaxyStudioGroundColor = STUDIO_GROUND_COLOR;

  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 90;
  sunLight.shadow.bias = -0.00035;
  sunLight.shadow.normalBias = 0.035;

  if (galaxyScene.stars) {
    scene.remove(galaxyScene.stars);
    galaxyScene.stars.geometry.dispose();
    galaxyScene.stars.material.dispose();
  }
  galaxyScene.stars = galaxyScene.createStarField(7200);
  scene.add(galaxyScene.stars);

  const originalSeasonalParticles = galaxyScene.createSeasonalParticles.bind(galaxyScene);
  galaxyScene.createSeasonalParticles = (palette, count = 1200) =>
    originalSeasonalParticles(palette, count);

  // Theme changes used to restore the much dimmer Raspberry-Pi-era light
  // levels. Preserve the molded-toy studio floor on every live behavior update.
  const originalApplyBehavior = galaxyScene.applyBehavior.bind(galaxyScene);
  galaxyScene.applyBehavior = (behavior) => {
    originalApplyBehavior(behavior);
    preserveStudioFill(galaxyScene);
  };
  preserveStudioFill(galaxyScene);

  scene.traverse((object) => {
    if (!object.isMesh) return;
    if (object === galaxyScene.sun) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}
