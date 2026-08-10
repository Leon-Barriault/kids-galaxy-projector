/**
 * Install projector render stages in one explicit, auditable order.
 *
 * Several legacy stages still extend PlanetEntity at runtime. Keeping their
 * composition in this one pipeline makes ordering a declared dependency rather
 * than an incidental sequence of side effects in the composition root.
 */
export function installPlanetRenderPipeline(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new TypeError('Planet render pipeline requires at least one stage');
  }

  const seen = new Set();
  const installed = [];

  for (const stage of stages) {
    if (!stage || typeof stage.name !== 'string' || !stage.name.trim()) {
      throw new TypeError('Planet render pipeline stages require a name');
    }
    if (typeof stage.install !== 'function') {
      throw new TypeError(`Planet render stage ${stage.name} requires an install function`);
    }
    if (seen.has(stage.name)) {
      throw new Error(`Duplicate planet render stage: ${stage.name}`);
    }

    seen.add(stage.name);
    stage.install();
    installed.push(stage.name);
  }

  return Object.freeze(installed);
}
