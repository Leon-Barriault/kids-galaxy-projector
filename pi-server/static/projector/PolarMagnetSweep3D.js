import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';
import { weldSeamAndPoleNormals } from './BeveledPatchRelief.js';

const POLAR_MAGNET_SWEEP_DEGREES = 360;
const POLAR_MAGNET_SWEEP_RADIANS = THREE.MathUtils.degToRad(POLAR_MAGNET_SWEEP_DEGREES);
const MIN_RADIUS = 0.000001;

function smoothstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function sweepProgress(normalizedY) {
  // +Y is the north pole and -Y is the south pole. The magnet progresses
  // continuously from north to south while each point travels only around its
  // own latitude ring. Smoothing keeps the twist gentle where the rings collapse
  // into the poles.
  return smoothstep((1 - THREE.MathUtils.clamp(normalizedY, -1, 1)) * 0.5);
}

function twistGeometryAroundPolarAxis(geometry) {
  const position = geometry?.getAttribute?.('position');
  if (!position?.count) return false;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const radius = Math.hypot(x, y, z);
    if (radius <= MIN_RADIUS) continue;

    const progress = sweepProgress(y / radius);
    const angle = progress * POLAR_MAGNET_SWEEP_RADIANS;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // This is a real 3-D rotation around the north/south (Y) axis. Y is left
    // untouched, so a point follows the blue constant-latitude circle from the
    // sketch instead of being remapped in a second flat projection plane.
    position.setXYZ(
      index,
      x * cos + z * sin,
      y,
      -x * sin + z * cos,
    );
  }

  position.needsUpdate = true;
  // The rotation amount changes with latitude, so rotating the old normals is
  // not enough: the deformation has shear. Rebuilding them makes the lighting
  // describe the actual twisted relief surface.
  geometry.computeVertexNormals();

  // ...and then weld them again, because computeVertexNormals undoes it.
  //
  // The relief sphere carries duplicate vertices: a whole extra column at the
  // UV seam so the texture has somewhere to land at u=1, and a fan of them at
  // each pole. On a 512x256 body that is 257 seam duplicates and 1,026 pole
  // duplicates - same position, separate indices. computeVertexNormals averages
  // the faces that share an *index*, so each duplicate only ever sees its own
  // side and they come out with different normals: a lit seam running pole to
  // pole and a pinwheel at each cap.
  //
  // buildBeveledReliefGeometry welds them for exactly this reason, immediately
  // after computing them. Recomputing here without welding again throws that
  // away. The twist itself is safe - it is a function of position alone, so
  // coincident vertices stay coincident.
  const segments = geometry.parameters;
  if (Number.isFinite(segments?.widthSegments) && Number.isFinite(segments?.heightSegments)) {
    weldSeamAndPoleNormals(geometry, segments.widthSegments, segments.heightSegments);
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxyPolarMagnetSweep3D = true;
  geometry.userData.kidsGalaxyPolarMagnetSweepDegrees = POLAR_MAGNET_SWEEP_DEGREES;
  geometry.userData.kidsGalaxyPolarMagnetAxis = 'north-south-y';
  geometry.userData.kidsGalaxyPolarMagnetMotion = 'constant-latitude-ring-twist';
  return true;
}

function applyPolarMagnetSweep(entity) {
  const material = entity?.mesh?.material;
  // The drawing manifest is the authoritative current tablet renderer. Run this
  // after it has built the final embossed sphere so colour, relief and all child
  // authored details are deformed together by the same 3-D action.
  if (!material?.userData?.kidsGalaxyManifestStrokeSurface) return false;
  if (!twistGeometryAroundPolarAxis(entity.mesh.geometry)) return false;

  material.userData.kidsGalaxyPolarMagnetSweep3D = true;
  material.userData.kidsGalaxyPolarMagnetSweepDegrees = POLAR_MAGNET_SWEEP_DEGREES;
  material.userData.kidsGalaxyPolarMagnetAxis = 'north-south-y';
  material.userData.kidsGalaxyPolarMagnetMotion = 'constant-latitude-ring-twist';
  material.userData.kidsGalaxyPolarMagnetProjectionMode = '3d-polar-latitude-ring-sweep';
  return true;
}

/**
 * Experimental interpretation of the user's magnet sketch.
 *
 * Imagine every surface point attached to a magnet that can only move along the
 * latitude circle crossing that point. From north to south the magnet phase
 * advances through one complete revolution. A straight north/south authored
 * mark therefore winds around the globe while both poles stay fixed because the
 * latitude circles shrink to a point there.
 *
 * This is intentionally a post-manifest geometry deformation, not another 2-D
 * texture projection. The sphere remains a sphere; only the surface
 * parameterization (including the raised kid artwork) is twisted in 3-D.
 */
export function installPolarMagnetSweep3D() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyPolarMagnetSweep3D) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function polarMagnetSweepTexture(texture) {
    previousApplyTexture.call(this, texture);
    try {
      applyPolarMagnetSweep(this);
    } catch (error) {
      console.error('Kids Galaxy 3-D polar magnet sweep failed', this.id, error);
      window.kidsGalaxyPolarMagnetSweepFailures = window.kidsGalaxyPolarMagnetSweepFailures || [];
      window.kidsGalaxyPolarMagnetSweepFailures.push({ id: this.id, message: String(error) });
    }
  }

  polarMagnetSweepTexture.kidsGalaxyPolarMagnetSweep3D = true;
  PlanetEntity.prototype.applyTexture = polarMagnetSweepTexture;
}
