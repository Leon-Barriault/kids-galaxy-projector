const REMEMBRANCE_DAY_THEME = 'remembrance-day';

const REMEMBRANCE_COLORS = {
  background: 0x030711,
  ambient: 0x8d93a3,
  ambientIntensity: 0.13,
  fill: 0x746e72,
  fillIntensity: 0.09,
};

const POPPY_RED_PALETTE = [0xb51f2e, 0xd12b3d, 0x8d1724, 0xe05a61];

function createMemorialMotes(scene) {
  const motes = scene.createSeasonalParticles(POPPY_RED_PALETTE, 120);
  motes.material.size = 0.17;
  motes.material.opacity = 0.46;
  motes.userData.kidsGalaxyRemembranceDay = true;
  motes.userData.kidsGalaxyMemorialMotes = true;
  motes.userData.kidsGalaxyMemorialPalette = 'poppy-red';
  return motes;
}

/**
 * Apply the deliberately quiet Remembrance Day presentation after the normal
 * galaxy behavior has run. The core scene treats unknown themes as default,
 * so asteroids and planet companions remain ordinary space objects rather than
 * becoming novelty holiday substitutions.
 */
export function applyRemembranceDayTheme(scene, celebration, behavior) {
  const theme = behavior?.theme;
  celebration?.setTheme?.(theme);
  if (theme !== REMEMBRANCE_DAY_THEME) return;

  scene.scene.background.setHex(REMEMBRANCE_COLORS.background);
  scene.scene.fog.color.setHex(REMEMBRANCE_COLORS.background);
  scene.ambientLight.color.setHex(REMEMBRANCE_COLORS.ambient);
  scene.ambientLight.intensity = REMEMBRANCE_COLORS.ambientIntensity;
  scene.fillLight.color.setHex(REMEMBRANCE_COLORS.fill);
  scene.fillLight.intensity = REMEMBRANCE_COLORS.fillIntensity;

  // Keep the scene alive, but noticeably calmer than a celebration theme.
  scene.starRotationSpeed = behavior?.ambient_effects === false ? 0.00005 : 0.00012;

  scene.disposeSeasonalParticles();
  if (behavior?.ambient_effects === false) return;

  scene.seasonalParticles = createMemorialMotes(scene);
  scene.scene.add(scene.seasonalParticles);
}
