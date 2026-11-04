import { normalizePlanetRendering } from './FrontViewProjection.js';

/** Coordinates persisted galaxy behavior with the live projector scene. */
export class ProjectorBehaviorController {
  constructor({ scene, celebration, environment = null }) {
    this.scene = scene;
    this.celebration = celebration;
    this.environment = environment;
    this.current = null;
    this.planetRendering = null;
    this.planetRenderingListener = null;
  }

  /**
   * Who rebuilds planets when the operator changes their rendering. Wired in the
   * composition root because the planet loader is built after this controller.
   */
  onPlanetRenderingChange(listener) {
    this.planetRenderingListener = listener;
    if (this.planetRendering) listener(this.planetRendering);
  }

  apply(behavior) {
    if (!behavior || typeof behavior !== 'object') return;
    this.current = behavior;
    this.scene.applyBehavior(behavior);
    this.celebration.setTheme(behavior.theme);
    this.environment?.applyBehavior(behavior);
    this.celebration.setLanguage(behavior.projector_language);
    // Behavior arrives on every poll and SSE frame; only an actual change of
    // rendering is worth rebuilding the wall for. A server that predates the
    // setting sends nothing, which reads as classic.
    const rendering = normalizePlanetRendering(behavior.planet_rendering);
    if (rendering !== this.planetRendering) {
      this.planetRendering = rendering;
      this.planetRenderingListener?.(rendering);
    }
  }

  handleEvent(raw) {
    try {
      this.apply(JSON.parse(raw));
    } catch (_error) {
      // Ignore malformed live frames; the next refresh/SSE event can recover.
    }
  }

  async refresh() {
    const response = await fetch('/api/behavior', {
      cache: 'no-store',
      signal:
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(4000)
          : undefined,
    });
    if (!response.ok) return;
    const payload = await response.json();
    this.apply(payload?.effective);
  }
}
