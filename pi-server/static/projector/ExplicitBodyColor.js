import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

/**
 * Make the tablet-selected bucket/background colour authoritative.
 *
 * All earlier artwork stages still inspect the uploaded drawing to extract and
 * sculpt the child's strokes. This outermost wrapper runs only after those
 * stages finish, so the body colour can no longer be replaced by inferred
 * dominant-stroke logic. Older planets have bodyColor=null and keep the legacy
 * inference path unchanged.
 */
export function installExplicitBodyColor() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyExplicitBodyColor) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function explicitBodyColorTexture(texture) {
    previousApplyTexture.call(this, texture);
    if (!this.bodyColor || !/^#[0-9a-fA-F]{6}$/.test(this.bodyColor)) return;

    const material = this.mesh?.material;
    if (!material?.isMaterial) return;

    material.color.copy(new THREE.Color(this.bodyColor));
    // The final body is a clean molded base. Child-authored strokes live in the
    // sculpted geometry group, not in a literal texture wrapped around the body.
    material.map = null;
    material.bumpMap = null;
    material.displacementMap = null;
    material.emissiveMap = null;
    material.userData.kidsGalaxyExplicitBodyColor = this.bodyColor.toLowerCase();
    material.userData.kidsGalaxyBodyColorSource = 'tablet-background';
    material.userData.kidsGalaxyBodyColorInferenceDisabled = true;
    material.needsUpdate = true;
  }

  explicitBodyColorTexture.kidsGalaxyExplicitBodyColor = true;
  PlanetEntity.prototype.applyTexture = explicitBodyColorTexture;
}
