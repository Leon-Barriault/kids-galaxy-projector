/**
 * Kids Galaxy Projector - Keplerian solar system, one planet per drawing.
 *
 * Every drawing becomes its own body. The gallery loads on page open, live
 * arrivals celebrate, deletions remove the planet from the sky, and the oldest
 * is disposed once GALLERY_SIZE is exceeded.
 *
 * Wire format (shared by GET /api/planets, GET /api/current-planet and SSE):
 *   { has_planet, id, url, name, timestamp }
 * Gallery response: { planets: [ ... ] }
 * SSE event type:   "planet"
 * Removal:          { has_planet: false, id, removed: true }
 *
 * Three.js is vendored; the import map in index.html points "three" at the
 * local copy so this page never reaches the network.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const GALLERY_SIZE = 12;
const MU = 40; // gravitational parameter behind the mean motion
const POLL_INTERVAL_MS = 2500;

const container = document.getElementById('canvas-container');
if (!container) {
  throw new Error('Missing #canvas-container');
}
const planetNameEl = document.getElementById('planet-name');
const statusEl = document.getElementById('status');
const celebrationEl = document.getElementById('celebration');
const sparklesEl = document.getElementById('sparkles');

// ---------------------------------------------------------------- scene ----

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050818);
scene.fog = new THREE.FogExp2(0x050818, 0.001);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 11, 26);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 40;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.2;

// Bright enough that a kid's drawing reads clearly through a projector, which
// loses a great deal of contrast compared with a monitor.
scene.add(new THREE.AmbientLight(0x8090c0, 0.85));
const fillLight = new THREE.DirectionalLight(0xaabbff, 0.55);
fillLight.position.set(0, 8, 20);
scene.add(fillLight);

// ------------------------------------------------------------- starfield ----

function createStarField(count = 3200) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 90 + Math.random() * 150;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const roll = Math.random();
    if (roll < 0.15) {
      colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 0.55;
    } else if (roll < 0.35) {
      colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
    } else {
      const c = 0.75 + Math.random() * 0.25;
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
    }),
  );
}

const stars = createStarField();
scene.add(stars);

// ------------------------------------------------------------------ sun ----

const sunGroup = new THREE.Group();
scene.add(sunGroup);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(1.85, 48, 48),
  new THREE.MeshBasicMaterial({ color: 0xffe066 }),
);
sunGroup.add(sun);

[
  { r: 2.2, color: 0xffb020, opacity: 0.32 },
  { r: 2.8, color: 0xff8800, opacity: 0.14 },
  { r: 3.5, color: 0xff6600, opacity: 0.06 },
].forEach(({ r, color, opacity }) => {
  sunGroup.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    ),
  );
});

sunGroup.add(new THREE.PointLight(0xfff5d0, 3.4, 100, 1.4));

// ------------------------------------------------------- Keplerian orbits ----

function meanMotion(a) {
  return Math.sqrt(MU / (a * a * a));
}

function solveKepler(M, e) {
  let E = M;
  for (let k = 0; k < 8; k++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

/** Reused every frame: allocating a Vector3 per body per frame is needless GC. */
const scratch = new THREE.Vector3();

function positionOnOrbit(params, t) {
  const M = params.M0 + params.n * t;
  const E = solveKepler(M, params.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const r = params.a * (1 - params.e * cosE);
  const xOrb = r * (cosE - params.e);
  const yOrb = r * Math.sqrt(1 - params.e * params.e) * sinE;
  return scratch.set(xOrb, yOrb * Math.sin(params.i), yOrb * Math.cos(params.i));
}

function createOrbitRing(a, e, inclination, color, opacity) {
  const segments = 160;
  const points = [];
  for (let k = 0; k <= segments; k++) {
    const M = (k / segments) * Math.PI * 2;
    const E = solveKepler(M, e);
    const cosE = Math.cos(E);
    const r = a * (1 - e * cosE);
    const xOrb = r * (cosE - e);
    const yOrb = r * Math.sqrt(1 - e * e) * Math.sin(E);
    points.push(
      new THREE.Vector3(xOrb, yOrb * Math.sin(inclination), yOrb * Math.cos(inclination)),
    );
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

// ------------------------------------------------------------ companions ----

const companions = [];

function addCompanion(radius, color, a, e, inclination, periodScale) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 24),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 }),
  );
  scene.add(mesh);
  scene.add(createOrbitRing(a, e, inclination, color, 0.18));
  companions.push({
    mesh,
    a,
    e,
    i: inclination,
    n: meanMotion(a) * periodScale,
    M0: Math.random() * Math.PI * 2,
  });
}

addCompanion(0.35, 0x88aaff, 5.0, 0.05, 0.1, 1.0);
addCompanion(0.5, 0xffaa77, 9.0, 0.08, -0.15, 0.7);
addCompanion(0.4, 0xaaffcc, 13.0, 0.04, 0.2, 0.5);

// ----------------------------------------------------------- kid planets ----

/**
 * id -> entry. The entry is inserted **synchronously**, before the texture
 * starts loading, and that is load-bearing:
 *
 * - the SSE stream primes every new subscriber with the current planet, so on
 *   each page load that planet arrives twice; a dedupe check that ran before
 *   an async insert would pass twice and orphan a mesh that never orbits and
 *   can never be disposed,
 * - a delete arriving while the texture is still in flight has to find
 *   something to cancel, otherwise the removed drawing appears afterwards and
 *   stays,
 * - and eviction has to happen in arrival order, not in whichever order the
 *   PNGs happened to decode.
 */
const kidPlanets = new Map();
let arrivalCounter = 0;
let galleryReady = false;

/** FNV-1a. Small, dependency-free, and stable across reloads. */
function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Orbit derived from the planet's own id rather than the order this particular
 * page session happened to see it in. A refresh, or a deletion earlier in the
 * list, would otherwise move every planet to a different orbit.
 */
function orbitParamsFor(id) {
  const h = hashId(id);
  const slot = h % GALLERY_SIZE;
  const a = 6.5 + slot * 0.75;
  const e = 0.04 + ((h >>> 4) % 3) * 0.03;
  const i = (((h >>> 8) % 5) - 2) * 0.08;
  return {
    a,
    e,
    i,
    n: meanMotion(a),
    M0: ((h >>> 12) % 628) / 100,
    spin: 0.4 + ((h >>> 20) % 30) / 100,
  };
}

function disposeEntry(entry) {
  entry.disposed = true;
  scene.remove(entry.mesh);
  scene.remove(entry.ring);
  entry.mesh.geometry.dispose();
  if (entry.mesh.material.map) entry.mesh.material.map.dispose();
  entry.mesh.material.dispose();
  entry.ring.geometry.dispose();
  entry.ring.material.dispose();
}

function removeKidPlanet(id) {
  const entry = kidPlanets.get(id);
  if (!entry) return;
  kidPlanets.delete(id);
  disposeEntry(entry);
}

/** "Clear all" from the manager app: empty the sky in one frame. */
function removeAllKidPlanets() {
  for (const entry of kidPlanets.values()) disposeEntry(entry);
  kidPlanets.clear();
  if (planetNameEl) {
    planetNameEl.textContent = 'Waiting for a planet…';
    planetNameEl.classList.remove('celebrate');
  }
  if (statusEl) statusEl.textContent = 'Draw on the tablet and launch into space!';
}

/**
 * Evict by arrival order, not by Map insertion order of the *texture* - those
 * differ whenever loads finish out of sequence, which is the normal case when
 * twelve gallery textures fetch in parallel.
 */
function makeRoomForOne() {
  while (kidPlanets.size >= GALLERY_SIZE) {
    let oldest = null;
    for (const entry of kidPlanets.values()) {
      if (!oldest || entry.order < oldest.order) oldest = entry;
    }
    if (!oldest) return;
    removeKidPlanet(oldest.id);
  }
}

function textureUrlOf(payload) {
  return payload.url || payload.texture_url || null;
}

function displayNameOf(payload) {
  return payload.name || payload.display_name || 'A new planet';
}

const textureLoader = new THREE.TextureLoader();

function addKidPlanet(payload, celebrate) {
  if (!payload || !payload.id) return;
  const textureUrl = textureUrlOf(payload);
  if (!textureUrl) return;
  if (kidPlanets.has(payload.id)) return;

  makeRoomForOne();

  const params = orbitParamsFor(payload.id);
  const timestamp = Number(payload.timestamp) || 0;

  // Mesh and ring exist immediately, with a plain material; the drawing is
  // swapped in when it arrives. The planet is therefore always a real, fully
  // disposable object from the instant it is registered.
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 48, 48),
    new THREE.MeshStandardMaterial({
      color: 0x9fb4d8,
      roughness: 0.45,
      metalness: 0.08,
      emissive: 0x223355,
      emissiveIntensity: 0.35,
    }),
  );
  mesh.scale.setScalar(celebrate ? 0.01 : 1);
  scene.add(mesh);

  const ring = createOrbitRing(params.a, params.e, params.i, 0x4fc3f7, 0.3);
  scene.add(ring);

  const entry = {
    id: payload.id,
    order: (arrivalCounter += 1),
    timestamp,
    mesh,
    ring,
    disposed: false,
    ...params,
  };
  kidPlanets.set(payload.id, entry);

  textureLoader.load(
    textureUrl,
    (texture) => {
      // The planet may have been deleted, or evicted, while this was in flight.
      if (entry.disposed || kidPlanets.get(payload.id) !== entry) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const material = entry.mesh.material;
      material.map = texture;
      // Self-illuminate from the drawing itself so colours stay vivid on the
      // night side; a projector flattens shading badly.
      material.emissive = new THREE.Color(0xffffff);
      material.emissiveMap = texture;
      material.emissiveIntensity = 0.55;
      material.color = new THREE.Color(0xffffff);
      material.needsUpdate = true;
    },
    undefined,
    () => {
      // Leave the placeholder sphere in orbit rather than deleting the planet:
      // a child who just launched one should still see something arrive.
      if (statusEl) statusEl.textContent = 'One planet is still finding its way here…';
    },
  );

  if (celebrate) {
    animateScaleIn(mesh);
    setPlanetName(displayNameOf(payload), true);
    showCelebration(displayNameOf(payload));
  }
}

function animateScaleIn(mesh) {
  const start = performance.now();
  const duration = 1000;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const eased = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    mesh.scale.setScalar(Math.max(0.01, eased));
    if (t < 1) requestAnimationFrame(tick);
    else mesh.scale.setScalar(1);
  }
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------ celebration ----

const SPARKLE_COLORS = ['#FFD54F', '#4FC3F7', '#FF8A65', '#CE93D8', '#A5D6A7', '#FFF59D', '#F48FB1'];

function burstSparkles(count = 36) {
  if (!sparklesEl) return;
  const cx = window.innerWidth * 0.5;
  const cy = window.innerHeight * 0.35;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'sparkle';
    const color = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
    el.style.background = color;
    el.style.color = color;
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const dist = 80 + Math.random() * 180;
    el.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    el.style.setProperty('--dy', Math.sin(angle) * dist - 40 + 'px');
    el.style.width = el.style.height = 8 + Math.random() * 10 + 'px';
    sparklesEl.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }
}

function setPlanetName(name, celebrate) {
  if (!planetNameEl) return;
  planetNameEl.textContent = '🌍 ' + name;
  planetNameEl.classList.add('visible');
  if (celebrate) {
    planetNameEl.classList.remove('celebrate');
    void planetNameEl.offsetWidth; // restart the CSS animation
    planetNameEl.classList.add('celebrate');
  }
}

/** One timer, so two arrivals in quick succession cannot cut each other short. */
let celebrationTimer = null;

function showCelebration(name) {
  burstSparkles();
  if (!celebrationEl) return;
  const msg = celebrationEl.querySelector('.msg');
  if (msg) msg.textContent = name + ' joined the sky!';
  celebrationEl.classList.add('show');
  if (celebrationTimer !== null) clearTimeout(celebrationTimer);
  celebrationTimer = setTimeout(() => {
    celebrationEl.classList.remove('show');
    celebrationTimer = null;
  }, 2800);
}

// ------------------------------------------------------------ live updates ----

/**
 * Reconciles the sky against the server's list: adds what is missing, removes
 * what is gone. Used for the initial load and as the polling fallback, so the
 * fallback path handles deletions too rather than only arrivals.
 */
async function syncGallery(celebrateNew) {
  const response = await fetch('/api/planets?limit=' + GALLERY_SIZE);
  if (!response.ok) return;
  const body = await response.json();
  const list = Array.isArray(body) ? body : body.planets || [];

  const live = new Set();
  // Newest first on the wire; add oldest first so arrival order is preserved.
  for (let i = list.length - 1; i >= 0; i--) {
    const planet = list[i];
    if (!planet || !planet.id) continue;
    live.add(planet.id);
    addKidPlanet(planet, celebrateNew && galleryReady);
  }

  for (const id of Array.from(kidPlanets.keys())) {
    if (!live.has(id)) removeKidPlanet(id);
  }

  if (list.length && !galleryReady) setPlanetName(displayNameOf(list[0]), false);
}

let pollTimer = null;

function startPolling() {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => {
    syncGallery(true).catch(() => {});
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer === null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function handlePlanetEvent(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return;
  }
  if (!data) return;
  // Checked before the id guard: a clear-all names no single planet, so it
  // arrives without an id and would otherwise be discarded as the empty
  // "no planet yet" payload.
  if (data.cleared) {
    removeAllKidPlanets();
    return;
  }
  if (!data.id) return; // the empty "no planet yet" payload
  if (data.removed || data.has_planet === false) {
    removeKidPlanet(data.id);
    return;
  }
  addKidPlanet(data, galleryReady && !kidPlanets.has(data.id));
}

/**
 * Push first, poll as a safety net. SSE gives an instant celebration; polling
 * exists because a proxy that buffers the stream would otherwise leave the
 * projector frozen on whatever was on screen at load, with no way back.
 */
function connectLiveUpdates() {
  if (typeof EventSource === 'undefined') {
    startPolling();
    return;
  }

  let failures = 0;

  function connect() {
    let source;
    try {
      source = new EventSource('/api/events');
    } catch (e) {
      startPolling();
      return;
    }

    source.addEventListener('open', () => {
      failures = 0;
      stopPolling(); // push is live, polling is redundant
    });

    source.addEventListener('planet', (event) => handlePlanetEvent(event.data));
    source.addEventListener('planet-removed', (event) => handlePlanetEvent(event.data));

    source.addEventListener('error', () => {
      startPolling(); // cover the gap while EventSource reconnects
      failures += 1;
      if (failures >= 5) {
        source.close();
        setTimeout(connect, 5000);
      }
    });
  }

  connect();
  // If the stream never opens at all, polling takes over shortly after load.
  setTimeout(() => {
    if (pollTimer === null && kidPlanets.size === 0) startPolling();
  }, POLL_INTERVAL_MS * 2);
}

// ------------------------------------------------------------------ loop ----

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  sun.rotation.y += 0.003;
  sunGroup.scale.setScalar(1 + Math.sin(t * 1.6) * 0.02);

  for (const companion of companions) {
    companion.mesh.position.copy(positionOnOrbit(companion, t));
    companion.mesh.rotation.y += 0.01;
  }

  for (const entry of kidPlanets.values()) {
    entry.mesh.position.copy(positionOnOrbit(entry, t));
    entry.mesh.rotation.y += entry.spin * 0.01;
  }

  stars.rotation.y += 0.0002;
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/**
 * Handle for the projector smoke test (scripts/check_projector.py) and for
 * poking at a live kiosk from the browser console on the Pi. Nothing in the
 * page reads it back; it exists purely so this file, which has no unit tests,
 * can be asserted against from outside.
 */
window.kidsGalaxy = { scene, kidPlanets, renderer, GALLERY_SIZE };

// Render first: a failure in the network bootstrap below must never leave the
// projector on a black screen.
animate();

syncGallery(false)
  .catch(() => {})
  .finally(() => {
    galleryReady = true;
    connectLiveUpdates();
  });
