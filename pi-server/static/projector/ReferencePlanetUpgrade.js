import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';
import { createWhiteBunny, normalizeTheme } from './ThemeVisualFactory.js';

function enableShadows(object) {
  object?.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function applyHandmadeSoftness(entity, geometry) {
  if (geometry.userData.kidsGalaxyReferenceBody) return geometry;
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const seed = entity.animator.hashId(`${entity.id}-reference-body`);
  const phaseA = ((seed >>> 3) & 0xff) / 255 * Math.PI * 2;
  const phaseB = ((seed >>> 11) & 0xff) / 255 * Math.PI * 2;

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    normal.copy(vertex).normalize();
    const variation =
      Math.sin(normal.x * 2.35 + normal.z * 1.45 + phaseA) * 0.0035 +
      Math.sin(normal.y * 2.7 - normal.x * 1.15 + phaseB) * 0.0028 +
      Math.sin((normal.x + normal.y + normal.z) * 3.1 + phaseA * 0.5) * 0.0018;
    vertex.multiplyScalar(1 + variation);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.userData.kidsGalaxyReferenceBody = true;
  geometry.userData.kidsGalaxyHandmadeSoftness = true;
  geometry.userData.handmadeVariation = 0.0081;
  return geometry;
}

function syncEasterBunnies(theme) {
  const easter = normalizeTheme(theme) === 'easter';
  this.companions.forEach((record) => {
    if (record.type !== 'astronaut') return;
    const isBunny = Boolean(record.object?.userData?.kidsGalaxyWhiteBunny);
    const isWitch = Boolean(record.object?.userData?.kidsGalaxyWitchOnBroom);

    if (easter && !isBunny) {
      this.disposeObject(record.object);
      record.object = createWhiteBunny();
      enableShadows(record.object);
      this.scene.add(record.object);
      return;
    }

    if (!easter && isBunny) {
      this.disposeObject(record.object);
      record.object = this.createCompanion('astronaut');
      enableShadows(record.object);
      this.scene.add(record.object);
      return;
    }

    // Halloween replacement is owned by HighFidelityPlanetFeatures.
    if (isWitch) enableShadows(record.object);
  });
}

/**
 * Final reference-art pass installed after the high-fidelity feature layer.
 * It adds only the almost-imperceptible molded body softness and Easter
 * companion substitution; surface colours/relief remain owned by PlanetSurface.
 */
export function installReferencePlanetUpgrade() {
  if (PlanetEntity.prototype.update?.kidsGalaxyReferencePlanetUpgrade) return;

  const previousCreatePlanetGeometry = PlanetEntity.prototype.createPlanetGeometry;
  PlanetEntity.prototype.createPlanetGeometry = function referencePlanetGeometry(radius = 1.05) {
    return applyHandmadeSoftness(
      this,
      previousCreatePlanetGeometry.call(this, radius),
    );
  };

  const previousUpdate = PlanetEntity.prototype.update;
  function referencePlanetUpdate(t, behavior = {}) {
    previousUpdate.call(this, t, behavior);
    syncEasterBunnies.call(this, behavior?.theme);
  }
  referencePlanetUpdate.kidsGalaxyReferencePlanetUpgrade = true;
  PlanetEntity.prototype.update = referencePlanetUpdate;
}
