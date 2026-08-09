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

function restoreKidSrgbBody(material) {
  if (!material?.color?.convertSRGBToLinear) return;
  // KidArtworkUpgrade receives ordinary 8-bit tablet RGB. Those values were
  // previously assigned as if already linear, which made saturated tablet
  // blue/green render much paler after output colour conversion. Interpret the
  // stored channels as sRGB exactly once so projected colours match the tablet.
  material.color.convertSRGBToLinear();
  material.userData.kidsGalaxyKidSrgbCorrected = true;
}

function removePaleShoulderHalo(edgeMaterial, topMaterial) {
  if (!edgeMaterial || !topMaterial?.alphaMap) return;
  // The original edge mask was deliberately dilated beyond the coloured
  // feature texture. At that shoulder perimeter the colour map was white,
  // producing a visible white outline. The shell radius already supplies real
  // sidewall depth, so use the same anti-aliased silhouette as the raised top
  // with a slightly lower threshold for a restrained same-hue shoulder.
  edgeMaterial.alphaMap = topMaterial.alphaMap;
  edgeMaterial.bumpMap = topMaterial.bumpMap;
  edgeMaterial.alphaTest = 0.18;
  edgeMaterial.needsUpdate = true;
  edgeMaterial.userData.kidsGalaxyNoPaleAccentHalo = true;
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
    restoreKidSrgbBody(this.mesh.material);
    removePaleShoulderHalo(this.accentEdgeMesh.material, this.accentMesh.material);
    this.mesh.material.userData.kidsGalaxyKidDesignFrontAligned = true;
    this.mesh.material.userData.kidsGalaxyKidDesignFrontU = 0.25;
  }

  alignedKidArtwork.kidsGalaxyKidArtworkPresentationFix = true;
  PlanetEntity.prototype.applyTexture = alignedKidArtwork;
}
