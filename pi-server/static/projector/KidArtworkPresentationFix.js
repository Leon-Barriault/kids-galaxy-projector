import { PlanetEntity } from './PlanetEntity.js';

const THREE_SPHERE_FRONT_U_OFFSET = 0.25;

function alignMaterialTextures(material) {
  if (!material) return;
  ['map', 'alphaMap', 'bumpMap', 'displacementMap'].forEach((key) => {
    const texture = material[key];
    if (!texture) return;
    // SphereGeometry faces +Z at u=0.25. The kid-art projection is authored
    // with its recognizable front centered at u=0.5, so sample the authored
    // map one quarter-turn later instead of presenting its seam to the camera.
    texture.offset.x = THREE_SPHERE_FRONT_U_OFFSET;
    texture.needsUpdate = true;
  });
}

/** Keep the child's recognizable drawing on the visible/front hemisphere. */
export function installKidArtworkPresentationFix() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyKidArtworkPresentationFix) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function alignedKidArtwork(texture) {
    previousApplyTexture.call(this, texture);
    if (!this.mesh.material.userData?.kidsGalaxyKidDesignProjection) return;

    alignMaterialTextures(this.accentEdgeMesh.material);
    alignMaterialTextures(this.accentMesh.material);
    this.mesh.material.userData.kidsGalaxyKidDesignFrontAligned = true;
    this.mesh.material.userData.kidsGalaxyKidDesignFrontU = 0.25;
  }

  alignedKidArtwork.kidsGalaxyKidArtworkPresentationFix = true;
  PlanetEntity.prototype.applyTexture = alignedKidArtwork;
}
