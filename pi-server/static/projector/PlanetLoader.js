import * as THREE from 'three';

import {
  normalizePlanetRendering,
  PLANET_RENDERING_CLASSIC,
} from './FrontViewProjection.js';
import { LiveUpdates } from './LiveUpdates.js';
import { PlanetEntity } from './PlanetEntity.js';
import { BUILD_HEADER } from './ProjectorBuildWatcher.js';

const DEFAULT_POLL_INTERVAL_MS = 2500;
const RGB_HEX = /^#[0-9a-fA-F]{6}$/;

/** Owns the projector's planet collection and all server synchronization. */
export class PlanetLoader {
  constructor({
    scene,
    animator,
    celebration,
    gallerySize,
    behaviorController = null,
    snapshotPublisher = null,
    buildWatcher = null,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  }) {
    this.scene = scene;
    this.animator = animator;
    this.celebration = celebration;
    this.gallerySize = gallerySize;
    this.behaviorController = behaviorController;
    this.snapshotPublisher = snapshotPublisher;
    this.buildWatcher = buildWatcher;
    this.pollIntervalMs = pollIntervalMs;
    this.kidPlanets = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.arrivalCounter = 0;
    this.galleryReady = false;
    this.pollTimer = null;
    this.pollInFlight = false;
    this.liveUpdates = null;
    // How kid drawings are wrapped onto planets; chosen on the manager tablet.
    this.planetRendering = PLANET_RENDERING_CLASSIC;
  }

  /**
   * Switch every planet on the wall to a different rendering.
   *
   * The surface stages build a planet once, as its texture arrives, and several
   * of them mutate the entity as they go - so a planet is rebuilt from its
   * stored drawing rather than re-wrapped in place. Orbits are derived from the
   * planet id and arrival order is preserved, so the sky does not reshuffle,
   * and nothing is celebrated: these are not new arrivals.
   */
  setPlanetRendering(value) {
    const next = normalizePlanetRendering(value);
    if (next === this.planetRendering) return false;
    this.planetRendering = next;
    this.rebuildAll();
    return true;
  }

  rebuildAll() {
    const entries = Array.from(this.kidPlanets.values()).sort((a, b) => a.order - b.order);
    entries.forEach((entry) => this.remove(entry.id));
    entries.forEach((entry) => this.add(entry.sourcePayload, false));
  }

  textureUrlOf(payload) {
    return payload.url || payload.texture_url || null;
  }

  manifestUrlOf(payload) {
    return typeof payload.drawing_manifest_url === 'string' ? payload.drawing_manifest_url : null;
  }

  displayNameOf(payload) {
    return this.celebration.displayName(payload);
  }

  makeRoomForOne() {
    while (this.kidPlanets.size >= this.gallerySize) {
      let oldest = null;
      for (const entry of this.kidPlanets.values()) {
        if (!oldest || entry.order < oldest.order) oldest = entry;
      }
      if (!oldest) return;
      this.remove(oldest.id);
    }
  }

  async loadDrawingManifest(payload, entity) {
    const url = this.manifestUrlOf(payload);
    if (!url) return false;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return false;
      const manifest = await response.json();
      if (
        manifest?.version !== 1 ||
        manifest?.coordinate_space !== 'normalized-canvas-v1' ||
        !Array.isArray(manifest?.strokes)
      ) {
        return false;
      }
      entity.drawingManifest = manifest;
      entity.mesh.userData.kidsGalaxyDrawingManifest = true;
      return true;
    } catch (error) {
      console.warn('Kids Galaxy drawing manifest could not be loaded', payload.id, error);
      return false;
    }
  }

  loadTexture(payload, entity, textureUrl) {
    this.textureLoader.load(
      textureUrl,
      (texture) => {
        if (entity.disposed || this.kidPlanets.get(payload.id) !== entity) {
          texture.dispose();
          return;
        }
        entity.applyTexture(texture);
        // The complete prototype-based projector pipeline has now transformed
        // this entity. Capture that final WebGL object graph for print/PDF use.
        this.snapshotPublisher?.schedule(entity);
      },
      undefined,
      () => this.celebration.textureLoadFailed(),
    );
  }

  add(payload, celebrate = false) {
    if (!payload || !payload.id) return;
    const textureUrl = this.textureUrlOf(payload);
    const manifestUrl = this.manifestUrlOf(payload);
    if (!textureUrl || !manifestUrl || this.kidPlanets.has(payload.id)) {
      if (textureUrl && !manifestUrl) {
        window.kidsGalaxyIgnoredImageOnlyPlanets = window.kidsGalaxyIgnoredImageOnlyPlanets || [];
        window.kidsGalaxyIgnoredImageOnlyPlanets.push(payload.id);
      }
      return;
    }

    this.makeRoomForOne();
    const entity = new PlanetEntity({
      payload,
      order: (this.arrivalCounter += 1),
      gallerySize: this.gallerySize,
      scene: this.scene,
      animator: this.animator,
      celebrate,
    });
    entity.bodyColor =
      typeof payload.body_color === 'string' && RGB_HEX.test(payload.body_color)
        ? payload.body_color.toLowerCase()
        : null;
    entity.drawingManifest = null;
    entity.planetRendering = this.planetRendering;
    entity.sourcePayload = payload;
    this.kidPlanets.set(payload.id, entity);

    // The drawing manifest is the authoritative rendering contract. Do not
    // display the archival PNG until its intent sidecar has been validated.
    this.loadDrawingManifest(payload, entity).then((loaded) => {
      if (entity.disposed || this.kidPlanets.get(payload.id) !== entity) return;
      if (!loaded) {
        this.remove(payload.id);
        return;
      }
      this.loadTexture(payload, entity, textureUrl);
    });

    if (celebrate) this.celebration.show(payload);
  }

  remove(id) {
    const entry = this.kidPlanets.get(id);
    if (!entry) return;
    this.kidPlanets.delete(id);
    entry.dispose();
  }

  clear() {
    for (const entry of this.kidPlanets.values()) entry.dispose();
    this.kidPlanets.clear();
    this.celebration.resetWaiting();
  }

  update(t) {
    const behavior = this.behaviorController?.current || {};
    for (const entry of this.kidPlanets.values()) entry.update(t, behavior);
  }

  async syncGallery(celebrateNew) {
    const response = await fetch('/api/planets?limit=' + this.gallerySize, {
      cache: 'no-store',
      signal: abortAfter(4000),
    });
    if (!response.ok) return;
    // Every reconnect re-reads the gallery, which is exactly when an update has
    // just happened. A different build means this page is running old code.
    if (this.buildWatcher?.observe(response.headers?.get?.(BUILD_HEADER))) return;
    const body = await response.json();
    const list = Array.isArray(body) ? body : body.planets || [];

    const live = new Set();
    for (let i = list.length - 1; i >= 0; i--) {
      const planet = list[i];
      if (!planet || !planet.id) continue;
      live.add(planet.id);
      this.add(planet, celebrateNew && this.galleryReady);
    }

    for (const id of Array.from(this.kidPlanets.keys())) {
      if (!live.has(id)) this.remove(id);
    }

    if (list.length && !this.galleryReady) {
      this.celebration.setPlanetName(this.displayNameOf(list[0]), false);
    }
  }

  startPolling() {
    if (this.pollTimer !== null) return;
    const tick = () => {
      // One poll at a time. A dying server can accept a fetch and then never
      // answer; stacking those fills the browser's per-host connection pool
      // and the wall stops being able to ask for anything.
      if (this.pollInFlight) return;
      this.pollInFlight = true;
      Promise.allSettled([
        this.syncGallery(true),
        this.behaviorController?.refresh(),
      ]).finally(() => {
        this.pollInFlight = false;
      });
    };
    tick();
    this.pollTimer = setInterval(tick, this.pollIntervalMs);
  }

  stopPolling() {
    if (this.pollTimer === null) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  handlePlanetEvent(raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_error) {
      return;
    }
    if (!data) return;

    if (data.cleared) {
      this.clear();
      return;
    }
    if (!data.id) return;
    if (data.removed || data.has_planet === false) {
      this.remove(data.id);
      return;
    }
    this.add(data, this.galleryReady && !this.kidPlanets.has(data.id));
  }

  connectLiveUpdates() {
    if (this.liveUpdates) return;
    if (typeof EventSource === 'undefined') {
      this.startPolling();
      return;
    }

    this.liveUpdates = new LiveUpdates({
      onPlanet: (raw) => this.handlePlanetEvent(raw),
      onPlanetRemoved: (raw) => this.handlePlanetEvent(raw),
      onBehavior: (raw) => this.behaviorController?.handleEvent(raw),
      onLive: () => {
        this.stopPolling();
        // The stream only primes the latest planet. Reconcile the gallery so
        // a planet that arrived while the socket was down still shows up,
        // without celebrating planets the wall already has.
        this.syncGallery(true).catch(() => {});
        this.behaviorController?.refresh().catch(() => {});
      },
      onOffline: () => this.startPolling(),
    });
    this.liveUpdates.start();
  }

  bootstrap() {
    return Promise.allSettled([this.syncGallery(false), this.behaviorController?.refresh()]).finally(() => {
      this.galleryReady = true;
      this.connectLiveUpdates();
    });
  }
}

function abortAfter(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}
