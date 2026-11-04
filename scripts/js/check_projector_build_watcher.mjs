/**
 * The wall reloads itself once when the server serves a newer projector.
 *
 * Without this, an updated galaxy program keeps being displayed by a kiosk
 * page that loaded the previous projector code, so new renderings switched on
 * from the manager tablet never appear. The watcher must reload exactly when
 * the build changes, never on an older server, and never in a loop.
 */
import { PlanetLoader } from './PlanetLoader.js';
import {
  BUILD_HEADER,
  pageBuildOf,
  ProjectorBuildWatcher,
  RELOAD_GUARD_MS,
} from './ProjectorBuildWatcher.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
};
const quiet = { info() {} };

console.log('\n1. the page build comes from the server-stamped meta tag');
const docWith = (content) => ({
  querySelector: (selector) =>
    selector === 'meta[name="kids-galaxy-build"]' && content !== undefined
      ? { getAttribute: () => content }
      : null,
});
check('reads the build', pageBuildOf(docWith('abc123')) === 'abc123');
check('an older server page has no build', pageBuildOf(docWith(undefined)) === null);
check('a blank tag counts as no build', pageBuildOf(docWith('  ')) === null);

console.log('\n2. reload decisions');
let reloads = 0;
let clock = 1_000_000;
const storage = memoryStorage();
const watcher = new ProjectorBuildWatcher({
  pageBuild: 'old',
  reload: () => { reloads += 1; },
  storage,
  now: () => clock,
  log: quiet,
});
check('same build: no reload', watcher.observe('old') === false && reloads === 0);
check('no header: no reload', watcher.observe(null) === false && reloads === 0);
check('new build: reload', watcher.observe('new') === true && reloads === 1);
check('only once per page', watcher.observe('new') === true && reloads === 1);

const comeback = new ProjectorBuildWatcher({ pageBuild: 'old', reload: () => { reloads += 1; }, storage, now: () => clock, log: quiet });
check('a page that comes back still old does not loop', comeback.observe('new') === false && reloads === 1);
clock += RELOAD_GUARD_MS + 1;
check('the guard expires', comeback.observe('new') === true && reloads === 2);

let olderServerReloads = 0;
const olderPage = new ProjectorBuildWatcher({ pageBuild: null, reload: () => { olderServerReloads += 1; }, log: quiet });
check('a page from an older server never reloads', olderPage.observe('new') === false && olderServerReloads === 0);

let unguarded = 0;
const noStorage = new ProjectorBuildWatcher({ pageBuild: 'old', reload: () => { unguarded += 1; }, storage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }, log: quiet });
check('blocked storage still reloads once', noStorage.observe('new') === true && unguarded === 1);

console.log('\n3. the gallery sync is where the wall notices');
const responses = [];
globalThis.fetch = async (url) => {
  if (String(url).startsWith('/api/planets')) {
    const build = responses.shift();
    return {
      ok: true,
      headers: { get: (name) => (name === BUILD_HEADER ? build : null) },
      json: async () => ({ planets: [{ id: 'a', url: '/uploads/a.png', drawing_manifest_url: '/uploads/a.json' }] }),
    };
  }
  return new Promise(() => {});
};
let wallReloads = 0;
const loader = new PlanetLoader({
  scene: { createOrbitRing: () => ({}) },
  animator: {},
  celebration: { show() {}, displayName: () => '', setPlanetName() {}, resetWaiting() {} },
  gallerySize: 12,
  buildWatcher: new ProjectorBuildWatcher({ pageBuild: 'old', reload: () => { wallReloads += 1; }, storage: memoryStorage(), log: quiet }),
});
responses.push('old');
await loader.syncGallery(false);
check('same build: the gallery is applied', loader.kidPlanets.has('a') && wallReloads === 0);
loader.kidPlanets.clear();
responses.push('new');
await loader.syncGallery(true);
check('new build: the wall reloads', wallReloads === 1);
check('and does not start adding planets to a page that is going away', !loader.kidPlanets.has('a'));

if (failures) {
  console.log(`\n${failures} projector build watcher check(s) failed`);
  process.exit(1);
}
console.log('\nProjector build watcher checks passed');
