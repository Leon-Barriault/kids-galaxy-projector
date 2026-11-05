/**
 * The manifest surface: every planet's body, built from the child's drawing.
 *
 * The maps (albedo, relief field, occlusion, roughness) are built off the main
 * thread by ManifestMapsClient; this module turns them into the painted-toy
 * material and the raised, bevelled geometry, then runs the surface-ready hooks
 * (the polar twist) and reveals the planet.
 */
import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';
import {
  attachReliefGeometry,
  bodyRadiusOf,
  bodyShaperFor,
  buildBeveledReliefGeometry,
} from './BeveledPatchRelief.js';
import { normalizePlanetRendering, PLANET_RENDERING_FRONT_VIEW } from './FrontViewProjection.js';
import { requestSurfaceMaps } from './ManifestMapsClient.js';
import { studioEnvironment } from './StudioEnvironment.js';
import {
  RELIEF_DISPLACEMENT,
  TEXTURE_HEIGHT,
  TEXTURE_WIDTH,
  validManifest,
} from './ManifestMaps.js';

// Re-exported for the rendering-maths checks, which import them from here.
export { buildFrontViewMaps, fillInternalBandGaps, roundedRelief } from './ManifestMaps.js';

const surfaceReadyHooks = [];

/**
 * Run `hook(entity)` each time a planet's manifest surface is in place. This is
 * how the polar twist follows the surface now that the surface arrives
 * asynchronously; it used to wrap applyTexture and run straight after it.
 */
export function addSurfaceReadyHook(hook) {
  if (typeof hook === 'function' && !surfaceReadyHooks.includes(hook)) surfaceReadyHooks.push(hook);
}

/** Hand a replaced resource to the planet so its dispose() frees it. */
function retire(entity, resource) {
  if (!entity.retiredResources) entity.retiredResources = [];
  if (!entity.retiredResources.includes(resource)) entity.retiredResources.push(resource);
}

function canvasTexture(canvas, { srgb = false } = {}) {
  if (!canvas) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function applyManifestSurface(entity, built, rendering) {
  if (!built) return false;
  const frontView = rendering === PLANET_RENDERING_FRONT_VIEW;
  const previous = entity.mesh.material;
  const material = new THREE.MeshPhysicalMaterial({
    map: canvasTexture(built.colour, { srgb: true }),
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.46,
    // Spread rather than sharpened. A tight clearcoat plus the sun's point light
    // put a blown specular flare on whichever rim faced it, which the reference
    // never has - its highlight is a broad soft shoulder. Widening the coat is
    // material-local, so it fixes the flare without re-lighting the gallery.
    clearcoatRoughness: 0.48,
    // The studio environment used to arrive second-hand, copied off the soft-toy
    // material this replaced. That stage is gone, so it is fetched directly -
    // same shared texture, same 0.85 the soft-toy pass set.
    envMap: studioEnvironment(entity.scene?.renderer || window.kidsGalaxy?.renderer) || null,
    envMapIntensity: 0.85,
  });
  // Real beveled geometry rather than a displacementMap plus a bumpMap. three.js
  // does not recompute normals for a displacementMap - it moves the vertex and
  // leaves the normal pointing where the undisplaced sphere pointed - so every
  // raised stroke used to be shaded as though it were still a smooth ball, and
  // the bumpMap was there to paint back an edge the lighting had thrown away.
  const reliefGeometry = buildBeveledReliefGeometry({
    heightField: built.reliefField,
    fieldWidth: TEXTURE_WIDTH,
    fieldHeight: TEXTURE_HEIGHT,
    radius: bodyRadiusOf(entity),
    displacement: RELIEF_DISPLACEMENT,
    shapeGeometry: bodyShaperFor(entity),
  });
  if (reliefGeometry) {
    const replaced = entity.mesh.geometry;
    attachReliefGeometry(entity, reliefGeometry);
    // The sphere createPlanetGeometry() made is owned by this planet alone, but
    // attachReliefGeometry only frees earlier relief builds. Keep it for the
    // planet's own dispose() rather than leaking it on the GPU.
    if (replaced && replaced !== entity.mesh.geometry && !replaced.userData?.kidsGalaxyBeveledRelief) {
      retire(entity, replaced);
    }
  }

  material.roughnessMap = canvasTexture(built.roughness);
  const occlusion = canvasTexture(built.occlusion);
  if (occlusion) {
    // aoMap defaults to the second UV set; the relief map shares the body's
    // layout exactly, and the geometry builder publishes uv1 as the same buffer,
    // so either resolution path lands on the right coordinates.
    occlusion.channel = 0;
    material.aoMap = occlusion;
    material.aoMapIntensity = 1;
  }
  material.userData.kidsGalaxyManifestStrokeSurface = true;
  material.userData.kidsGalaxyEmbossedStrokeCount = built.strokeCount;
  material.userData.kidsGalaxyEmbossLayerLevels = built.layerLevels;
  material.userData.kidsGalaxyEmbossStrokeProfiles = built.strokeProfiles;
  material.userData.kidsGalaxyEmbossHeightHeuristic = 'order35-width25-coverage20-pole10-jitter10';
  material.userData.kidsGalaxyNorthPoleStroke = built.northPoleStroke;
  material.userData.kidsGalaxySouthPoleStroke = built.southPoleStroke;
  // Same contract keys the ManifestInternalGapFill stage published, so the
  // checks that watch gap filling keep working. Version 3 because the mechanism
  // moved: gaps are closed in the ownership map before geometry is built rather
  // than painted over the finished textures afterwards. Relief texels equal
  // filled texels now by construction - a bridged gap is owned paint, so it is
  // raised by the ordinary relief pass, where v2 bridged the two separately and
  // could fill colour while silently failing to raise anything.
  material.userData.kidsGalaxyInternalGapFillTexels = built.internalGapTexels;
  material.userData.kidsGalaxyInternalGapReliefTexels = built.internalGapTexels;
  material.userData.kidsGalaxyInternalGapFillWidestRun = built.internalGapWidestRun;
  material.userData.kidsGalaxyInternalGapFillVersion = 3;
  // Keep the stable contract name used by the shared projector smoke suite. The
  // implementation is now periodic/wavy rather than row-filled, but it is still
  // the same manifest-strokes-on-body rendering stage.
  material.userData.kidsGalaxyDesignProjectionMode = frontView
    ? 'manifest-front-view-mirrored'
    : 'manifest-strokes-layered-on-body';
  // Read by PolarMagnetSweep3D, which leaves front-view planets untwisted.
  material.userData.kidsGalaxyPlanetRendering = rendering;

  // The material being replaced, and every texture on it, belongs to this
  // planet. Earlier stages may still hold a reference, so it is freed with the
  // planet rather than here.
  if (previous && previous !== material) retire(entity, previous);
  entity.mesh.material = material;
  // The base renderer raises two accent shells over the body for the old
  // image-only path. Nothing draws on them once the manifest owns the surface;
  // left visible they cost two extra spheres per planet in every pass.
  if (entity.accentEdgeMesh) entity.accentEdgeMesh.visible = false;
  if (entity.accentMesh) entity.accentMesh.visible = false;
  // A body casts shadows only where one can be seen: on its own ring. The sun
  // is a point light, so every caster is drawn six more times a frame into the
  // shadow cube; measured on an Iris Xe that halved the frame rate.
  entity.mesh.castShadow = entity.style === 'ringed';
  entity.mesh.receiveShadow = true;
  entity.mesh.userData.kidsGalaxyDrawingManifest = true;
  entity.mesh.userData.kidsGalaxyManifestBackground = entity.drawingManifest.background_color;
  entity.mesh.userData.kidsGalaxyManifestStrokeCount = built.strokeCount;
  return true;
}

function reportFailure(entity, error) {
  console.error('Kids Galaxy manifest stroke surface failed', entity.id, error);
  window.kidsGalaxyManifestStrokeFailures = window.kidsGalaxyManifestStrokeFailures || [];
  window.kidsGalaxyManifestStrokeFailures.push({ id: entity.id, message: String(error) });
}

/**
 * Build the manifest surface for a planet. Resolves true once it is on screen,
 * false if the planet went away first or there was nothing to build.
 */
function buildManifestSurface(entity) {
  if (typeof document === 'undefined' || !validManifest(entity?.drawingManifest)) {
    return Promise.resolve(false);
  }
  // Chosen on the manager tablet and stamped on the entity by PlanetLoader when
  // it is created; a change rebuilds the planet rather than re-wrapping it.
  const rendering = normalizePlanetRendering(entity.planetRendering);
  // Hidden until its surface is ready, so the base renderer's placeholder never
  // flashes up for the few frames the maps take to arrive.
  entity.mesh.visible = false;
  return requestSurfaceMaps(entity.drawingManifest, rendering)
    .then((built) => {
      if (entity.disposed) return false;
      const applied = applyManifestSurface(entity, built, rendering);
      if (applied) {
        surfaceReadyHooks.forEach((hook) => {
          try {
            hook(entity);
          } catch (error) {
            reportFailure(entity, error);
          }
        });
      }
      return applied;
    })
    .catch((error) => {
      reportFailure(entity, error);
      return false;
    })
    .finally(() => {
      if (!entity.disposed) entity.mesh.visible = true;
    });
}

export function installManifestStrokeSurface() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyManifestStrokeSurface) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;
  function manifestStrokeTexture(texture) {
    previousApplyTexture.call(this, texture);
    // PlanetLoader waits on this before capturing the planet's print snapshot.
    this.surfaceReady = buildManifestSurface(this);
  }
  manifestStrokeTexture.kidsGalaxyManifestStrokeSurface = true;
  PlanetEntity.prototype.applyTexture = manifestStrokeTexture;
}
