import * as THREE from 'three';

const SNAPSHOT_SIZE = 700;
const SNAPSHOT_FOV_DEGREES = 40;
// Distance the key light is placed at for a hero frame, regardless of where the
// planet actually is in its orbit. The sun is a point light with decay 2 and
// intensity 92, so this fixes the key irradiance at about 1.4 - firm enough to
// model the bevels, soft enough that the studio environment still carries the
// wrap, which is the balance the reference look depends on. Distance rather than
// intensity so that nothing about the cloned light's own configuration is
// second-guessed here.
const SNAPSHOT_KEY_DISTANCE = 8;
const MIN_CAMERA_DISTANCE = 7.4;
const CAMERA_FRAME_PADDING = 1.14;
// Keep the printed/exported hero almost straight-on. The live galaxy can use a
// dramatic orbital view, but the keepsake should read like a centred product
// photo so the kid's latitude ribbons are not compressed toward one edge.
const CAMERA_ELEVATION_RATIO = 0.075;
// Ringed planets still need enough vertical offset for the real Saturn ring to
// open into an ellipse, but the old -0.5 ratio looked strongly tilted on paper.
const RING_CAMERA_ELEVATION_RATIO = -0.24;
const MAX_UPLOAD_ATTEMPTS = 3;

/**
 * Captures the finalized Three.js planet as an isolated hero frame and stores
 * it on the server. The exact runtime meshes/materials are cloned, so sculpted
 * kid artwork, crater/mountain geometry, Saturn rings and selected companions
 * are the same objects the projector shows instead of a server approximation.
 */
export class ProjectorSnapshotPublisher {
  constructor({ galaxyScene }) {
    this.galaxyScene = galaxyScene;
    this.renderer = galaxyScene.renderer;
    this.pending = new Map();
    // Every snapshot temporarily borrows the *live* WebGLRenderer. Captures must
    // never overlap: each capture saves renderer state and later restores it, so
    // overlapping captures can restore another capture's off-screen target and
    // leave the projector rendering forever into a disposed 700x700 framebuffer.
    // Serialising the whole capture/encode step also gives the animation loop
    // time between planets while PNG encoding runs asynchronously.
    this.captureQueue = Promise.resolve();
  }

  schedule(entity) {
    if (!entity || entity.disposed || !entity.id) return;
    const previous = this.pending.get(entity.id);
    if (previous !== undefined) window.clearTimeout(previous);

    // applyTexture() is synchronous, but two animation frames let the final
    // pipeline wrappers and renderer upload their geometry/textures first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (entity.disposed) return;
        const timer = window.setTimeout(() => {
          this.pending.delete(entity.id);
          this.enqueueCaptureAndPublish(entity).catch((error) => {
            console.warn('Kids Galaxy projector snapshot failed', entity.id, error);
          });
        }, 60);
        this.pending.set(entity.id, timer);
      });
    });
  }

  enqueueCaptureAndPublish(entity) {
    const run = this.captureQueue.then(() => this.captureAndPublish(entity));
    // A failed planet must not poison the queue for every planet after it.
    this.captureQueue = run.catch(() => {});
    return run;
  }

  async captureAndPublish(entity) {
    if (entity.disposed) return;
    const blob = await this.capture(entity);
    if (!blob || entity.disposed) return;

    const url = `/api/admin/planets/${encodeURIComponent(entity.id)}/rendered-preview.png`;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt += 1) {
      // Re-checked every attempt, not just before the first. A planet can be
      // deleted during the backoff between attempts, and there is no point
      // uploading a hero frame for something that no longer exists.
      if (entity.disposed) return;
      try {
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: blob,
          cache: 'no-store',
        });
        if (response.ok) {
          entity.userData = entity.userData || {};
          entity.userData.kidsGalaxyWebglSnapshotPublished = true;
          entity.userData.kidsGalaxyWebglSnapshotSize = SNAPSHOT_SIZE;
          return;
        }
        // 404 means the server has no such planet - it was deleted while this
        // snapshot was being captured, and the client has not processed the SSE
        // removal yet. Retrying cannot succeed, and each attempt costs another
        // browser-level console error that no JS handler can suppress. This is
        // why a single deleted planet produced exactly three of them.
        if (response.status === 404) return;
        lastError = new Error(`snapshot upload returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 180));
    }
    throw lastError || new Error('snapshot upload failed');
  }

  capture(entity) {
    const exportScene = this.createExportScene(entity);
    const camera = this.createExportCamera(entity, exportScene);
    const target = new THREE.WebGLRenderTarget(SNAPSHOT_SIZE, SNAPSHOT_SIZE, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;

    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousViewport = renderer.getViewport(new THREE.Vector4());
    const previousScissor = renderer.getScissor(new THREE.Vector4());
    const previousScissorTest = renderer.getScissorTest();
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    let pixels = null;

    try {
      renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, SNAPSHOT_SIZE, SNAPSHOT_SIZE);
      renderer.setScissor(0, 0, SNAPSHOT_SIZE, SNAPSHOT_SIZE);
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.clear(true, true, true);
      renderer.render(exportScene, camera);

      pixels = new Uint8Array(SNAPSHOT_SIZE * SNAPSHOT_SIZE * 4);
      renderer.readRenderTargetPixels(target, 0, 0, SNAPSHOT_SIZE, SNAPSHOT_SIZE, pixels);
    } finally {
      // Restore the live framebuffer *before* any asynchronous PNG encoding.
      // canvas.toBlob() can take long enough for multiple animation frames on a
      // kiosk. Keeping the off-screen target bound until its callback completes
      // makes those frames invisible and, with overlapping captures, allowed
      // stale/disposed targets to be restored out of order.
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.autoClear = previousAutoClear;
      target.dispose();
      this.disposeExportScene(exportScene);
    }

    if (!pixels) return Promise.resolve(null);
    return this.pixelsToPng(pixels);
  }

  /**
   * Release what the export scene allocated, and only that.
   *
   * Object3D.clone() shares geometry and material with the original, so those
   * must be left alone - disposing them here would strip the live planet the
   * clone came from. A cloned light is different: Light.copy() gives it its own
   * LightShadow, and a shadow-casting point light allocates a six-face cube
   * shadow map. Nothing disposed that, so every published snapshot leaked one,
   * and a full gallery of twelve leaked twelve. Enough of them exhausts GPU
   * memory and the context is lost - at which point the last frame stays on
   * screen and the galaxy appears to stop, moments after a preview is generated.
   */
  disposeExportScene(scene) {
    if (!scene) return;
    scene.traverse((object) => {
      if (object.isLight && object.shadow?.map) {
        object.shadow.map.dispose();
        object.shadow.map = null;
      }
      if (object.isLight) object.dispose?.();
    });
    scene.clear();
  }

  createExportScene(entity) {
    const scene = new THREE.Scene();
    // Export only the planet object graph. A transparent background lets the
    // print compositor place it on white paper without spending a square of ink
    // on the projector's dark-sky backdrop.
    scene.background = null;

    const framingObjects = [];
    const planet = entity.mesh.clone(true);
    planet.position.set(0, 0, 0);
    // A newly arrived planet may still be in its scale-in celebration. Export
    // the final production size, not the transient 1% arrival animation.
    planet.scale.setScalar(1);
    scene.add(planet);
    framingObjects.push(planet);

    for (const decoration of entity.decorations || []) {
      const clone = decoration.clone(true);
      clone.position.set(0, 0, 0);
      scene.add(clone);
      framingObjects.push(clone);
    }

    // Compute the main planet/decorations bounds before companions and lights are
    // added. The old camera always looked at world origin; that lets an internally
    // offset mesh or asymmetric decoration drift toward a corner and get clipped.
    // Framing the actual rendered object graph keeps the planet centred and gives
    // it a predictable safe margin in every capture.
    scene.updateMatrixWorld(true);
    const framingBounds = new THREE.Box3();
    for (const object of framingObjects) framingBounds.expandByObject(object);
    scene.userData.kidsGalaxyExportFramingBounds = framingBounds;

    // Companions are visible parts of the child's selected planet design. Keep
    // their live relative positions, but omit the large gallery orbit guide. They
    // do not pull the main planet away from the centre of the hero frame.
    for (const record of entity.companions || []) {
      const clone = record.object.clone(true);
      clone.position.copy(record.object.position).sub(entity.mesh.position);
      scene.add(clone);
    }

    const ambient = this.galaxyScene.ambientLight?.clone();
    if (ambient) scene.add(ambient);
    const fill = this.galaxyScene.fillLight?.clone();
    if (fill) scene.add(fill);

    const sun = this.galaxyScene.sunLight?.clone();
    if (sun) {
      // The hero frame is a single planet on a plain background with nothing to
      // receive a shadow, so casting one buys nothing and costs a whole cube
      // shadow map allocated on the spot. Off before the light is ever rendered
      // is cheaper than disposing it afterwards.
      sun.castShadow = false;
      // Direction from the live sun, distance normalised.
      //
      // This used to preserve the true distance too, so that the hero image used
      // "the same lighting model as the projector". The light decays with the
      // square of that distance, and planets orbit between roughly 3 and 20
      // units out, so the key varied about forty-five fold - irradiance 10.2 at
      // the near end against 0.23 at the far end. A planet caught near the sun
      // came back with a blown white flare along whichever rim faced it; one
      // caught far out came back nearly unlit. Worse, it is not reproducible:
      // the same drawing snapshotted twice, at two points in its orbit, yields
      // two different pictures, and these frames are what gets printed.
      //
      // A hero frame is a product shot. Keeping the direction preserves the
      // relationship with the projected scene; fixing the distance is what makes
      // one planet comparable with the next.
      sun.position.copy(this.galaxyScene.sunGroup.position).sub(entity.mesh.position);
      if (sun.position.lengthSq() < 1) sun.position.set(-5, 5, 8);
      sun.position.setLength(SNAPSHOT_KEY_DISTANCE);
      scene.add(sun);
    }

    return scene;
  }

  createExportCamera(entity, exportScene) {
    const camera = new THREE.PerspectiveCamera(
      SNAPSHOT_FOV_DEGREES,
      1,
      0.1,
      100,
    );
    const hasSaturnRing = (entity.decorations || []).some(
      (decoration) => decoration.userData?.kidsGalaxySaturnParticleRing,
    );
    // Keep ringed exports a little below the equator so the ring remains an
    // ellipse, but use a much less dramatic angle than the old product shot.
    const elevationRatio = hasSaturnRing
      ? RING_CAMERA_ELEVATION_RATIO
      : CAMERA_ELEVATION_RATIO;

    const target = new THREE.Vector3(0, 0, 0);
    let distance = MIN_CAMERA_DISTANCE;
    const bounds = exportScene?.userData?.kidsGalaxyExportFramingBounds;
    if (bounds?.isBox3 && !bounds.isEmpty()) {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      target.copy(sphere.center);
      const halfFov = THREE.MathUtils.degToRad(SNAPSHOT_FOV_DEGREES / 2);
      const fittedDistance = (sphere.radius / Math.sin(halfFov)) * CAMERA_FRAME_PADDING;
      distance = Math.max(MIN_CAMERA_DISTANCE, fittedDistance);
    }

    const elevation = distance * elevationRatio;
    camera.position.set(target.x, target.y + elevation, target.z + distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    return camera;
  }

  pixelsToPng(pixels) {
    const canvas = document.createElement('canvas');
    canvas.width = SNAPSHOT_SIZE;
    canvas.height = SNAPSHOT_SIZE;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('2D canvas is unavailable for snapshot encoding');

    const image = context.createImageData(SNAPSHOT_SIZE, SNAPSHOT_SIZE);
    const rowBytes = SNAPSHOT_SIZE * 4;
    for (let y = 0; y < SNAPSHOT_SIZE; y += 1) {
      const sourceOffset = (SNAPSHOT_SIZE - 1 - y) * rowBytes;
      const targetOffset = y * rowBytes;
      image.data.set(pixels.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset);
    }
    context.putImageData(image, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('could not encode projector snapshot PNG'));
      }, 'image/png');
    });
  }
}
