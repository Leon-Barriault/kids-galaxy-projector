/**
 * Kids Galaxy Projector – solar system with Keplerian orbits
 * and kid-friendly visual polish (glow, sparkles, celebration UI).
 *
 * Multi-planet: every drawing becomes its own body. Gallery loads on
 * page open; live SSE arrivals celebrate; oldest past GALLERY_SIZE is disposed.
 *
 * Wire format (shared by GET /api/planets, GET /api/current-planet, SSE):
 *   { has_planet, id, url, name, timestamp }
 * Gallery response: { planets: [ ... ] }
 * SSE event type: "planet"
 * Removal: { has_planet: false, id, removed: true }
 */

import * as THREE from './vendor/three.module.js';

const GALLERY_SIZE = 12;
const MU = 40; // gravitational parameter for Keplerian mean motion

const canvasContainer = document.getElementById('canvas-container');
if (!canvasContainer) {
  console.error('Missing #canvas-container');
  throw new Error('Missing #canvas-container');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 12, 28);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
canvasContainer.appendChild(renderer.domElement);

// Sun
const sunGeom = new THREE.SphereGeometry(1.8, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
const sun = new THREE.Mesh(sunGeom, sunMat);
scene.add(sun);
const sunLight = new THREE.PointLight(0xfff5d0, 3.4, 100);
sun.add(sunLight);
const ambient = new THREE.AmbientLight(0x606090, 0.75);
// Fill light from the camera side so the near hemisphere is never dark
const fillLight = new THREE.DirectionalLight(0xaabbff, 0.55);
fillLight.position.set(0, 8, 20);
scene.add(fillLight);
scene.add(ambient);

// Decorative companions (fixed)
function makeCompanion(radius, color, a, e, i, periodScale) {
  const g = new THREE.SphereGeometry(radius, 16, 16);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const mesh = new THREE.Mesh(g, m);
  scene.add(mesh);
  return { mesh, a, e, i, n: Math.sqrt(MU / (a * a * a)) * periodScale, M0: Math.random() * Math.PI * 2 };
}
const companions = [
  makeCompanion(0.35, 0x88aaff, 5.5, 0.05, 0.1, 1.0),
  makeCompanion(0.5, 0xffaa77, 9.0, 0.08, -0.15, 0.7),
  makeCompanion(0.4, 0xaaffcc, 13.0, 0.04, 0.2, 0.5),
];

// Kid planets
const kidPlanets = new Map();
let nextOrbitIndex = 0;

function orbitParamsForIndex(index) {
  const a = 6.5 + (index % 6) * 1.6;
  const e = 0.04 + (index % 3) * 0.03;
  const i = ((index % 5) - 2) * 0.08;
  const n = Math.sqrt(MU / (a * a * a));
  const M0 = (index * 1.7) % (Math.PI * 2);
  return { a, e, i, n, M0 };
}

function disposeOldestIfNeeded() {
  while (kidPlanets.size >= GALLERY_SIZE) {
    const oldest = kidPlanets.keys().next().value;
    const entry = kidPlanets.get(oldest);
    kidPlanets.delete(oldest);
    if (entry) {
      scene.remove(entry.mesh);
      if (entry.mesh.geometry) entry.mesh.geometry.dispose();
      if (entry.mesh.material) {
        if (entry.mesh.material.map) entry.mesh.material.map.dispose();
        if (entry.mesh.material.emissiveMap) entry.mesh.material.emissiveMap.dispose();
        entry.mesh.material.dispose();
      }
    }
  }
}

function removeKidPlanet(planetId) {
  const entry = kidPlanets.get(planetId);
  if (!entry) return;
  kidPlanets.delete(planetId);
  scene.remove(entry.mesh);
  if (entry.mesh.geometry) entry.mesh.geometry.dispose();
  if (entry.mesh.material) {
    if (entry.mesh.material.map) entry.mesh.material.map.dispose();
    if (entry.mesh.material.emissiveMap) entry.mesh.material.emissiveMap.dispose();
    entry.mesh.material.dispose();
  }
}

/**
 * Server payload uses `url` and `name` (see Planet.to_payload).
 * Accept legacy aliases so a mismatched client still works during rollout.
 */
function textureUrlOf(payload) {
  return payload.url || payload.texture_url || null;
}

function displayNameOf(payload) {
  return payload.name || payload.display_name || 'New planet!';
}

function addKidPlanet(payload, celebrate) {
  if (!payload || !payload.id) return;
  const textureUrl = textureUrlOf(payload);
  if (!textureUrl) return;
  if (kidPlanets.has(payload.id)) return;

  disposeOldestIfNeeded();
  const params = orbitParamsForIndex(nextOrbitIndex++);
  const loader = new THREE.TextureLoader();
  loader.load(
    textureUrl,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const geom = new THREE.SphereGeometry(1.05, 32, 32);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.45,
        metalness: 0.08,
        // Self-illuminate so kid drawings stay vivid under the projector
        // even when the sphere faces away from the sun light.
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.55,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.scale.setScalar(celebrate ? 0.01 : 1);
      scene.add(mesh);
      kidPlanets.set(payload.id, {
        mesh,
        ...params,
        spin: 0.4 + Math.random() * 0.3,
        born: performance.now(),
        celebrate: !!celebrate,
      });
      if (celebrate) {
        showCelebration(displayNameOf(payload));
        setPlanetName(displayNameOf(payload), true);
        animateScaleIn(mesh);
      } else {
        setPlanetName(displayNameOf(payload), false);
      }
    },
    undefined,
    (err) => console.warn('texture load failed', textureUrl, err),
  );
}

function animateScaleIn(mesh) {
  const start = performance.now();
  const duration = 900;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const eased = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    mesh.scale.setScalar(Math.max(0.01, eased));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function setPlanetName(name, celebrate) {
  const el = document.getElementById('planet-name');
  if (!el) return;
  el.textContent = name;
  el.classList.add('visible');
  if (celebrate) {
    el.classList.remove('celebrate');
    void el.offsetWidth;
    el.classList.add('celebrate');
  }
}

function showCelebration(name) {
  const el = document.getElementById('celebration');
  if (!el) return;
  const msg = el.querySelector('.msg');
  if (msg) {
    msg.textContent = name + ' joined the sky!';
  } else {
    el.textContent = name + ' joined the sky!';
  }
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function kepler(M, e) {
  let E = M;
  for (let k = 0; k < 8; k++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

function positionOnOrbit(params, t) {
  const M = params.M0 + params.n * t;
  const E = kepler(M, params.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const r = params.a * (1 - params.e * cosE);
  const xOrb = r * (cosE - params.e);
  const yOrb = r * Math.sqrt(1 - params.e * params.e) * sinE;
  const cosI = Math.cos(params.i);
  const sinI = Math.sin(params.i);
  return new THREE.Vector3(xOrb, yOrb * sinI, yOrb * cosI);
}

async function loadInitialGallery() {
  try {
    const res = await fetch('/api/planets?limit=' + GALLERY_SIZE);
    if (!res.ok) return;
    const body = await res.json();
    const list = Array.isArray(body) ? body : body.planets || [];
    for (let i = list.length - 1; i >= 0; i--) {
      addKidPlanet(list[i], false);
    }
  } catch (e) {
    console.warn('gallery load failed', e);
  }
}

function connectSSE() {
  const es = new EventSource('/api/events');

  const onPlanet = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (!data || !data.id) return;
      if (data.removed || data.has_planet === false) {
        removeKidPlanet(data.id);
        return;
      }
      const isNew = !kidPlanets.has(data.id);
      addKidPlanet(data, isNew);
    } catch (_) {}
  };

  es.addEventListener('planet', onPlanet);
  es.onmessage = onPlanet;

  es.addEventListener('planet-removed', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data && data.id) removeKidPlanet(data.id);
    } catch (_) {}
  });

  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 3000);
  };
}

const starGeom = new THREE.BufferGeometry();
const starCount = 800;
const positions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  positions[i * 3] = (Math.random() - 0.5) * 120;
  positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
}
starGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const stars = new THREE.Points(
  starGeom,
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.85 }),
);
scene.add(stars);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  sun.rotation.y += 0.002;
  for (const c of companions) {
    c.mesh.position.copy(positionOnOrbit(c, t));
    c.mesh.rotation.y += 0.01;
  }
  for (const entry of kidPlanets.values()) {
    entry.mesh.position.copy(positionOnOrbit(entry, t));
    entry.mesh.rotation.y += entry.spin * 0.01;
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadInitialGallery();
connectSSE();
animate();
