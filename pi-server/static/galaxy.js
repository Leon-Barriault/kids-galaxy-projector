/**
 * Kids Galaxy Projector – solar system with Keplerian orbits
 * and kid-friendly visual polish (glow, sparkles, celebration UI).
 *
 * Multi-planet: every drawing becomes its own body. Gallery loads on
 * page open; live SSE arrivals celebrate; oldest past GALLERY_SIZE is disposed.
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
const sunLight = new THREE.PointLight(0xfff5d0, 2.2, 80);
sun.add(sunLight);
const ambient = new THREE.AmbientLight(0x404060, 0.35);
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
        entry.mesh.material.dispose();
      }
    }
  }
}

function addKidPlanet(payload, celebrate) {
  if (!payload || !payload.id || !payload.texture_url) return;
  if (kidPlanets.has(payload.id)) return;
  disposeOldestIfNeeded();
  const params = orbitParamsForIndex(nextOrbitIndex++);
  const loader = new THREE.TextureLoader();
  loader.load(
    payload.texture_url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const geom = new THREE.SphereGeometry(0.85, 32, 32);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.85,
        metalness: 0.05,
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
        showCelebration(payload.display_name || 'New planet!');
        animateScaleIn(mesh);
      }
    },
    undefined,
    (err) => console.warn('texture load failed', err),
  );
}

function animateScaleIn(mesh) {
  const start = performance.now();
  const duration = 900;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    // easeOutBack
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const eased = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    mesh.scale.setScalar(Math.max(0.01, eased));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showCelebration(name) {
  const el = document.getElementById('celebration');
  if (!el) return;
  el.textContent = name + ' joined the sky!';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
  // sparkles left as optional DOM if present
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
    const list = await res.json();
    // server returns newest first; load oldest-first so orbit indices feel stable
    for (let i = list.length - 1; i >= 0; i--) {
      addKidPlanet(list[i], false);
    }
  } catch (e) {
    console.warn('gallery load failed', e);
  }
}

function connectSSE() {
  const es = new EventSource('/api/events');
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data && data.id) addKidPlanet(data, true);
    } catch (_) {}
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 3000);
  };
}

// stars
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
