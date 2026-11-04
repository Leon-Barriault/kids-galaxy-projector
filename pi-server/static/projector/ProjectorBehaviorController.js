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
    // Behavior reaches the wall two ways: SSE frames, pushed the moment the
    // manager changes something, and REST refreshes on boot, reconnect and
    // poll. A refresh that was already in flight when the manager switched can
    // land after the SSE frame and put the old value back - and with a healthy
    // stream nothing corrects it again. Every arrival takes a ticket when it is
    // *requested*; a result older than the one on screen is dropped.
    this.ticket = 0;
    this.appliedTicket = 0;
  }

  /**
   * Who rebuilds planets when the operator changes their rendering. Wired in the
   * composition root because the planet loader is built after this controller.
   */
  onPlanetRenderingChange(listener) {
    this.planetRenderingListener = listener;
    if (this.planetRendering) listener(this.planetRendering);
  }

  apply(behavior, ticket = (this.ticket += 1)) {
    if (!behavior || typeof behavior !== 'object') return false;
    if (ticket < this.appliedTicket) return false;
    this.appliedTicket = ticket;
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
    return true;
  }

  handleEvent(raw) {
    const ticket = (this.ticket += 1);
    try {
      this.apply(JSON.parse(raw), ticket);
    } catch (_error) {
      // Ignore malformed live frames; the next refresh/SSE event can recover.
    }
  }

  async refresh() {
    const ticket = (this.ticket += 1);
    const response = await fetch('/api/behavior', {
      cache: 'no-store',
      signal:
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(4000)
          : undefined,
    });
    if (!response.ok) return;
    const payload = await response.json();
    this.apply(payload?.effective, ticket);
  }
}
