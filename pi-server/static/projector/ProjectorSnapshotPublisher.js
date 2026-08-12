import * as THREE from 'three';

const SNAPSHOT_SIZE = 700;
const SNAPSHOT_FOV_DEGREES = 40;
const CAMERA_DISTANCE = 7.4;
// Nearly level with the equator. This was 11/26, looking down about 23 degrees,
// which suited a planet whose interest was sculpted lumps catching the light
// from above. Now that a drawing arrives as latitude bands, looking down that
// far gives the north pole a third of the frame and crushes every band below
// the equator into the bottom edge - the child's green stripe becomes a sliver.
// Ten degrees keeps enough elevation to read as a sphere rather than a disc
// while leaving the bands their own share of the height.
const CAMERA_ELEVATION_RATIO = 0.176;
const RING_CAMERA_ELEVATION_RATIO = -1 / 2;
const MAX_UPLOAD_ATTEMPTS = 3;

/**
 * Captures the finalized Three.js planet as an isolated hero frame and stores
 * it on the Pi. The exact runtime meshes/materials are cloned, so sculpted kid
 * artwork, crater/mountain geometry, Saturn rings and selected companions are
 * the same objects the projector shows instead of a server-side approximation.
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
    const camera = this.createExportCamera(entity);
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
    let pixels = null;

    try {
      renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, SNAPSHOT_SIZE, SNAPSHOT_SIZE);
      renderer.setScissor(0, 0, SNAPSHOT_SIZE, SNAPSHOT_SIZE);
      renderer.setScissorTest(false);
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
    const sourceBackground = this.galaxyScene.scene.background;
    scene.background = sourceBackground?.isColor ? sourceBackground.clone() : new THREE.Color(0x050818);

    const planet = entity.mesh.clone(true);
    planet.position.set(0, 0, 0);
    // A newly arrived planet may still be in its scale-in celebration. Export
    // the final production size, not the transient 1% arrival animation.
    planet.scale.setScalar(1);
    scene.add(planet);

    for (const decoration of entity.decorations || []) {
      const clone = decoration.clone(true);
      clone.position.set(0, 0, 0);
      scene.add(clone);
    }

    // Companions are visible parts of the child's selected planet design. Keep
    // their live relative positions, but omit the large gallery orbit guide.
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
      // Preserve the live sun direction and inverse-square distance from this
      // planet so the hero image uses the same lighting model as the projector.
      sun.position.copy(this.galaxyScene.sunGroup.position).sub(entity.mesh.position);
      if (sun.position.lengthSq() < 1) sun.position.set(-5, 5, 8);
      scene.add(sun);
    }

    return scene;
  }

  createExportCamera(entity) {
    const camera = new THREE.PerspectiveCamera(
      SNAPSHOT_FOV_DEGREES,
      1,
      0.1,
      100,
    );
    const hasSaturnRing = (entity.decorations || []).some(
      (decoration) => decoration.userData?.kidsGalaxySaturnParticleRing,
    );
    // The live Saturn ring is tilted mostly toward -Y/+Z. Looking from the
    // normal +Y hero elevation makes that real ring nearly edge-on. Keep the
    // same front longitude but move the export camera below the equator for
    // ringed planets so the actual particle ring opens into a readable ellipse.
    const elevationRatio = hasSaturnRing
      ? RING_CAMERA_ELEVATION_RATIO
      : CAMERA_ELEVATION_RATIO;
    const elevation = CAMERA_DISTANCE * elevationRatio;
    camera.position.set(0, elevation, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return camera;
  }

  pixelsToPng(pixels) {
    const canvas = document.createElement('canvas');
    canvas.width = SNAPSHOT_SIZE;
    canvas.height = SNAPSHOT_SIZE;
    const context = canvas.getContext('2d', { alpha: false });
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
