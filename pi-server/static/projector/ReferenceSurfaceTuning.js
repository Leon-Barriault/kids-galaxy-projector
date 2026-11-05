import { PlanetEntity } from './PlanetEntity.js';

function disableSaturnSpeckleShadows(entity) {
  const ring = entity.decorations?.[entity.decorations.length - 1];
  if (!ring?.userData?.kidsGalaxySaturnParticleRing) return;
  ring.traverse((child) => {
    if (!child.isMesh && !child.isPoints) return;
    child.castShadow = false;
    child.receiveShadow = false;
  });
  ring.userData.kidsGalaxyParticleShadowsDisabled = true;
}

/**
 * Saturn ring tuning: the speckle particles should not cast or receive shadows.
 *
 * This stage also used to re-tune the kid-artwork relief, but the manifest
 * surface replaces that material wholesale, so only the ring half remains.
 */
export function installReferenceSurfaceTuning() {
  if (PlanetEntity.prototype.addPlanetRing?.kidsGalaxyReferenceSurfaceTuning) return;
  const previousAddPlanetRing = PlanetEntity.prototype.addPlanetRing;

  function referenceSaturnRing() {
    previousAddPlanetRing.call(this);
    disableSaturnSpeckleShadows(this);
  }

  referenceSaturnRing.kidsGalaxyReferenceSaturnShadowTuning = true;
  referenceSaturnRing.kidsGalaxyReferenceSurfaceTuning = true;
  PlanetEntity.prototype.addPlanetRing = referenceSaturnRing;
}
