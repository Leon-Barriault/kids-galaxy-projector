import { normalizeTheme, themeDefinition } from './ThemeRegistry.js';

/** Apply the authoritative registry definition after the base scene behavior. */
export function applySeasonalTheme(scene, celebration, behavior = {}) {
  const theme = normalizeTheme(behavior.theme);
  const definition = themeDefinition(theme);

  celebration?.setTheme?.(theme);

  scene.scene.background.setHex(definition.background);
  scene.scene.fog.color.setHex(definition.background);
  scene.ambientLight.color.setHex(definition.ambient);
  scene.ambientLight.intensity = definition.ambientIntensity;
  scene.fillLight.color.setHex(definition.fill);
  scene.fillLight.intensity = definition.fillIntensity;

  const ambientEnabled = behavior.ambient_effects !== false;
  scene.starRotationSpeed = ambientEnabled
    ? definition.starRotationSpeed
    : theme === 'remembrance-day'
      ? 0.00005
      : 0.0002;

  scene.disposeSeasonalParticles();
  if (!ambientEnabled || !definition.particles?.length) return;

  const particles = scene.createSeasonalParticles(
    definition.particles,
    definition.particleCount,
  );
  particles.material.size = definition.particleSize;
  particles.material.opacity = definition.particleOpacity;
  particles.userData.kidsGalaxySeasonalTheme = theme;
  particles.userData.kidsGalaxyThemeRegistry = true;
  scene.seasonalParticles = particles;
  scene.scene.add(particles);
}
