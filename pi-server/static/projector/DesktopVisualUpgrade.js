import * as THREE from 'three';

/** Apply the high-quality rendering profile now that the projector runs from a laptop. */
export function applyDesktopVisualUpgrade(galaxyScene) {
  const { renderer, scene, sunLight } = galaxyScene;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.userData ??= {};
  renderer.userData.kidsGalaxyQualityProfile = 'laptop-high';
  renderer.userData.kidsGalaxyRealtimeShadows = true;

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

  scene.traverse((object) => {
    if (!object.isMesh) return;
    if (object === galaxyScene.sun) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}
