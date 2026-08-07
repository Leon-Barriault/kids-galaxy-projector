/**
 * Kids Galaxy Projector – solar system with Keplerian orbits
 * and kid-friendly visual polish (glow, sparkles, celebration UI).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('canvas-container');
const planetNameEl = document.getElementById('planet-name');
const statusEl = document.getElementById('status');
const celebrationEl = document.getElementById('celebration');
const sparklesEl = document.getElementById('sparkles');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050818);
scene.fog = new THREE.FogExp2(0x050818, 0.001);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 9, 17);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x4a6088, 0.5));

const MU = 14.0;

function meanMotion(semiMajorAxis) {
  return Math.sqrt(MU / Math.pow(semiMajorAxis, 3));
}

function solveKepler(M, e) {
  let E = M;
  for (let i = 0; i < 8; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
  }
  return E;
}

function trueAnomaly(E, e) {
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const cosNu = (cosE - e) / (1 - e * cosE);
  const sinNu = (Math.sqrt(1 - e * e) * sinE) / (1 - e * cosE);
  return Math.atan2(sinNu, cosNu);
}

function orbitRadius(a, e, E) {
  return a * (1 - e * Math.cos(E));
}

function setOrbitalPosition(mesh, a, e, meanAnomaly, argPeriapsis = 0) {
  const M = ((meanAnomaly % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const E = solveKepler(M, e);
  const nu = trueAnomaly(E, e);
  const r = orbitRadius(a, e, E);
  const angle = nu + argPeriapsis;
  mesh.position.set(r * Math.cos(angle), 0, r * Math.sin(angle));
}

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
    })
  );
}

const stars = createStarField();
scene.add(stars);

const sunGroup = new THREE.Group();
scene.add(sunGroup);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(1.85, 48, 48),
  new THREE.MeshBasicMaterial({ color: 0xffe066 })
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
      })
    )
  );
});

sunGroup.add(new THREE.PointLight(0xfff2cc, 2.6, 70, 1.4));

function createOrbitRing(a, e = 0, color = 0x66aadd, opacity = 0.28) {
  const segments = 160;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const M = (i / segments) * Math.PI * 2;
    const E = solveKepler(M, e);
    const nu = trueAnomaly(E, e);
    const r = orbitRadius(a, e, E);
    points.push(new THREE.Vector3(r * Math.cos(nu), 0, r * Math.sin(nu)));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.LineLoop(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
}

const bodies = [];

function addPlanet({
  a,
  e = 0.04,
  radius,
  color,
  inclination = 0,
  spin = 0.015,
  argPeri = 0,
  meanAnomaly0 = Math.random() * Math.PI * 2,
  ringColor = 0x5599cc,
  isKid = false,
}) {
  const pivot = new THREE.Group();
  pivot.rotation.x = inclination;
  scene.add(pivot);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, isKid ? 64 : 28, isKid ? 64 : 28),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.65,
      metalness: 0.06,
      emissive: isKid ? 0x112244 : 0x000000,
      emissiveIntensity: isKid ? 0.15 : 0,
    })
  );
  pivot.add(mesh);

  if (isKid || radius > 0.4) {
    mesh.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.07, 24, 24),
        new THREE.MeshBasicMaterial({
          color: isKid ? 0x66ccff : color,
          transparent: true,
          opacity: isKid ? 0.18 : 0.08,
          side: THREE.BackSide,
          depthWrite: false,
        })
      )
    );
  }

  pivot.add(createOrbitRing(a, e, ringColor, isKid ? 0.4 : 0.22));

  const body = {
    pivot,
    mesh,
    a,
    e,
    n: meanMotion(a),
    M: meanAnomaly0,
    spin,
    argPeri,
    isKid,
  };
  bodies.push(body);
  setOrbitalPosition(mesh, a, e, body.M, argPeri);
  return body;
}

addPlanet({ a: 4.0, e: 0.06, radius: 0.32, color: 0xff8a65, inclination: 0.06, spin: 0.02, ringColor: 0xff9966 });
addPlanet({ a: 9.2, e: 0.08, radius: 0.72, color: 0x7e9fff, inclination: -0.07, spin: 0.012, ringColor: 0x7799ee });
addPlanet({ a: 12.2, e: 0.05, radius: 0.26, color: 0xb3e5fc, inclination: 0.1, spin: 0.018, ringColor: 0x88ccee });

const kidBody = addPlanet({
  a: 6.6,
  e: 0.07,
  radius: 1.0,
  color: 0x42a5f5,
  inclination: 0.09,
  spin: 0.018,
  meanAnomaly0: 0.4,
  ringColor: 0x4fc3f7,
  isKid: true,
});
const planet = kidBody.mesh;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 30;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.2;

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
    setTimeout(function () { el.remove(); }, 1900);
  }
}

function showCelebration(name) {
  if (celebrationEl) {
    const msg = celebrationEl.querySelector('.msg');
    if (msg) msg.textContent = name + ' joined the solar system!';
    celebrationEl.classList.add('show');
    setTimeout(function () { celebrationEl.classList.remove('show'); }, 3200);
  }
  burstSparkles();
}

const textureLoader = new THREE.TextureLoader();
let currentPlanetUrl = null;

function applyPlanetTexture(url, name) {
  if (url === currentPlanetUrl) return;
  currentPlanetUrl = url;

  textureLoader.load(
    url,
    function (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const newMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.6,
        metalness: 0.04,
        emissive: 0x1a3050,
        emissiveIntensity: 0.12,
      });
      if (planet.material) planet.material.dispose();
      planet.material = newMat;

      planet.scale.set(0.05, 0.05, 0.05);
      const start = performance.now();
      const duration = 1100;

      function animateIn(now) {
        const t = Math.min(1, (now - start) / duration);
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const ease = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        const s = Math.max(0.05, ease);
        planet.scale.set(s, s, s);
        if (t < 1) requestAnimationFrame(animateIn);
        else planet.scale.set(1, 1, 1);
      }
      requestAnimationFrame(animateIn);

      const displayName = name || 'A new planet';
      if (planetNameEl) {
        planetNameEl.textContent = '\ud83c\udf0d ' + displayName;
        planetNameEl.classList.add('visible', 'celebrate');
        setTimeout(function () { planetNameEl.classList.remove('celebrate'); }, 1000);
      }
      if (statusEl) {
        statusEl.textContent = 'Watch it orbit the sun and spin!';
        setTimeout(function () {
          statusEl.textContent = 'Draw another planet on the tablet anytime!';
        }, 6000);
      }
      showCelebration(displayName);
    },
    undefined,
    function (err) {
      console.error('Failed to load planet texture', err);
      if (statusEl) statusEl.textContent = 'Hmm, that planet got lost in space\u2026 try again!';
    }
  );
}

function handlePlanetPayload(data) {
  if (data && data.has_planet && data.url) {
    applyPlanetTexture(data.url, data.name);
  }
}

async function checkForNewPlanet() {
  try {
    const res = await fetch('/api/current-planet');
    if (!res.ok) return;
    handlePlanetPayload(await res.json());
  } catch (e) {
    /* Offline or server restarting - the next tick will retry. */
  }
}

/**
 * Live updates. Preferred path is Server-Sent Events, so a new planet appears
 * the instant it is uploaded. If SSE is unavailable (or drops repeatedly), we
 * fall back to the original 2.5s poll so the projector never goes dark.
 */
const POLL_INTERVAL_MS = 2500;
let pollTimer = null;

function startPolling() {
  if (pollTimer !== null) return;
  pollTimer = setInterval(checkForNewPlanet, POLL_INTERVAL_MS);
  checkForNewPlanet();
}

function stopPolling() {
  if (pollTimer === null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function startLiveUpdates() {
  if (typeof EventSource === 'undefined') {
    startPolling();
    return;
  }

  let sseFailures = 0;

  function connect() {
    let source;
    try {
      source = new EventSource('/api/events');
    } catch (e) {
      startPolling();
      return;
    }

    source.addEventListener('open', function () {
      sseFailures = 0;
      stopPolling(); // Push is live; polling is redundant.
    });

    source.addEventListener('planet', function (event) {
      try {
        handlePlanetPayload(JSON.parse(event.data));
      } catch (e) {
        console.warn('Bad planet event payload', e);
      }
    });

    source.addEventListener('error', function () {
      // EventSource auto-reconnects, but poll in the meantime so we never stall.
      startPolling();
      sseFailures += 1;
      if (sseFailures >= 5) {
        // Give up on push and stay on the poll path.
        source.close();
        console.warn('SSE unavailable - staying on polling fallback');
      }
    });
  }

  connect();
  // Safety net: if SSE never opens, polling takes over shortly after load.
  setTimeout(function () {
    if (pollTimer === null && currentPlanetUrl === null) checkForNewPlanet();
  }, POLL_INTERVAL_MS);
}

startLiveUpdates();

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = performance.now() * 0.001;

  sun.rotation.y += 0.003;
  const pulse = 1 + Math.sin(t * 1.6) * 0.02;
  sunGroup.scale.setScalar(pulse);

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.M += b.n * dt;
    setOrbitalPosition(b.mesh, b.a, b.e, b.M, b.argPeri);
    b.mesh.rotation.y += b.spin * dt * 60;
  }

  stars.rotation.y += 0.0001 * dt * 60;
  if (stars.material) {
    stars.material.opacity = 0.85 + Math.sin(t * 2.2) * 0.1;
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

console.log('Kids Galaxy Projector \u2013 Keplerian solar system ready (\u03bc=' + MU + ')');
