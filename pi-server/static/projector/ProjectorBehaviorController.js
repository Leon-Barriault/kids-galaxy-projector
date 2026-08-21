import { applySeasonalTheme } from './SeasonalThemeController.js';

/** Coordinates persisted galaxy behavior with the live projector scene. */
export class ProjectorBehaviorController {
  constructor({ scene, celebration, environment = null }) {
    this.scene = scene;
    this.celebration = celebration;
    this.environment = environment;
    this.current = null;
  }

  apply(behavior) {
    if (!behavior || typeof behavior !== 'object') return;
    this.current = behavior;
    this.scene.applyBehavior(behavior);
    applySeasonalTheme(this.scene, this.celebration, behavior);
    this.environment?.applyBehavior(behavior);
    this.celebration.setLanguage(behavior.projector_language);
  }

  handleEvent(raw) {
    try {
      this.apply(JSON.parse(raw));
    } catch (_error) {
      // Ignore malformed live frames; the next refresh/SSE event can recover.
    }
  }

  async refresh() {
    const response = await fetch('/api/behavior');
    if (!response.ok) return;
    const payload = await response.json();
    this.apply(payload?.effective);
  }
}
