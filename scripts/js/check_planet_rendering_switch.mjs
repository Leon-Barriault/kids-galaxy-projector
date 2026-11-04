/**
 * Switching planet rendering from the manager tablet rebuilds the wall.
 *
 * The behavior controller must only react to an actual change - behavior
 * arrives on every poll and SSE frame - and the loader must rebuild every
 * planet in arrival order, stamped with the new rendering, without treating any
 * of them as a new arrival.
 */
import { PlanetLoader } from './PlanetLoader.js';
import { ProjectorBehaviorController } from './ProjectorBehaviorController.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

// The loader fetches each planet's manifest before its texture. Leaving that
// fetch pending keeps the check to the synchronous lifecycle under test.
globalThis.fetch = () => new Promise(() => {});

console.log('\n1. the behavior controller reports changes, not repeats');
const scene = { applyBehavior() {} };
const celebration = { setTheme() {}, setLanguage() {}, show() {}, displayName: () => '' };
const controller = new ProjectorBehaviorController({ scene, celebration });
const heard = [];
controller.onPlanetRenderingChange((rendering) => heard.push(rendering));
controller.apply({ theme: 'default' });
check('a server without the setting reads as classic', heard.join() === 'classic', heard.join());
controller.apply({ theme: 'default', planet_rendering: 'classic' });
check('an unchanged value is not re-announced', heard.length === 1);
controller.apply({ theme: 'default', planet_rendering: 'front-view' });
check('a real change is announced', heard.at(-1) === 'front-view');
controller.apply({ theme: 'halloween', planet_rendering: 'front-view' });
check('other behavior changes do not trigger a rebuild', heard.length === 2);
const late = [];
controller.onPlanetRenderingChange((rendering) => late.push(rendering));
check('a listener wired late is told the current value', late.join() === 'front-view');

console.log('\n1b. a refresh already in flight cannot undo a newer SSE frame');
{
  let release;
  globalThis.fetch = () =>
    new Promise((resolve) => {
      release = () =>
        resolve({ ok: true, json: async () => ({ effective: { theme: 'default', planet_rendering: 'classic' } }) });
    });
  const raced = new ProjectorBehaviorController({ scene, celebration });
  const changes = [];
  raced.onPlanetRenderingChange((rendering) => changes.push(rendering));
  raced.apply({ theme: 'default', planet_rendering: 'classic' });
  const inFlight = raced.refresh();
  raced.handleEvent(JSON.stringify({ theme: 'default', planet_rendering: 'front-view' }));
  release();
  await inFlight;
  check('the stale refresh is dropped', raced.planetRendering === 'front-view', changes.join(' -> '));
  check('the wall rebuilt once, not back and forth', changes.join() === 'classic,front-view', changes.join(' -> '));
  const later = raced.refresh();
  release();
  await later;
  check('a refresh requested after the frame still applies', raced.planetRendering === 'classic');
  globalThis.fetch = () => new Promise(() => {});
}

console.log('\n2. the loader rebuilds every planet in arrival order');
let celebrations = 0;
const loader = new PlanetLoader({
  scene: { createOrbitRing: () => ({}) },
  animator: {},
  celebration: { ...celebration, show() { celebrations += 1; } },
  gallerySize: 12,
});
['a', 'b', 'c'].forEach((id) =>
  loader.add({ id, url: `/uploads/${id}.png`, drawing_manifest_url: `/uploads/${id}.json` }),
);
const before = Array.from(loader.kidPlanets.values());
check('planets start classic', before.every((p) => p.planetRendering === 'classic'));
check('switching to the same rendering is a no-op', loader.setPlanetRendering('classic') === false);
check('switching rendering reports a rebuild', loader.setPlanetRendering('front-view') === true);
const after = Array.from(loader.kidPlanets.values());
check('every planet is still on the wall', after.map((p) => p.id).join() === 'a,b,c');
check('each planet is a fresh entity', after.every((p, i) => p !== before[i]));
check('old entities were disposed', before.every((p) => p.disposed));
check('rebuilt planets carry the new rendering', after.every((p) => p.planetRendering === 'front-view'));
check(
  'arrival order is preserved',
  after.every((p, i) => i === 0 || p.order > after[i - 1].order),
);
check('nothing is celebrated', celebrations === 0, `${celebrations}`);
loader.add({ id: 'd', url: '/uploads/d.png', drawing_manifest_url: '/uploads/d.json' });
check('a planet arriving later uses the current rendering', loader.kidPlanets.get('d').planetRendering === 'front-view');
check('unknown values fall back to classic', loader.setPlanetRendering('hologram') === true && loader.planetRendering === 'classic');

if (failures) {
  console.log(`\n${failures} planet rendering switch check(s) failed`);
  process.exit(1);
}
console.log('\nPlanet rendering switch checks passed');
