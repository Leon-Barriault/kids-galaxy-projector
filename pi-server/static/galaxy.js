/**
 * Kids Galaxy Projector - Three.js solar system visualization
 *
 * - Glowing sun at the center
 * - The child's planet orbits the sun AND spins on its axis
 * - Decorative companion planets for depth
 * - Star field background
 * - Polls backend for new planet uploads and applies texture
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// -------------------- Scene Setup --------------------
const container = document.getElementById('canvas-container');
const planetNameEl = document.getElementById('planet-name');
const statusEl = document.getElementById('status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x02040a, 0.0012);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
// Pull back so the full solar system is in frame
camera.position.set(0, 8, 16);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Soft ambient so the dark side of planets is still visible for kids
const ambient = new THREE.AmbientLight(0x334466, 0.45);
scene.add(ambient);

// -------------------- Stars --------------------
function createStarField(count = 2800) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 90 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const c = 0.65 + Math.random() * 0.35;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = c;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.35,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}

const stars = createStarField();
scene.add(stars);

// -------------------- Sun (center of the system) --------------------
const sunGroup = new THREE.Group();
scene.add(sunGroup);

const sunGeo = new THREE.SphereGeometry(1.8, 48, 48);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
const sun = new THREE.Mesh(sunGeo, sunMat);
sunGroup.add(sun);

// Outer glow shells
const sunGlowGeo = new THREE.SphereGeometry(2.15, 32, 32);
const sunGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffaa22,
  transparent: true,
  opacity: 0.28,
  side: THREE.BackSide,
});
sunGroup.add(new THREE.Mesh(sunGlowGeo, sunGlowMat));

const sunHaloGeo = new THREE.SphereGeometry(2.7, 32, 32);
const sunHaloMat = new THREE.MeshBasicMaterial({
  color: 0xff8800,
  transparent: true,
  opacity: 0.1,
  side: THREE.BackSide,
});
sunGroup.add(new THREE.Mesh(sunHaloGeo, sunHaloMat));

// Point light from the sun so planets are lit from the center
const sunLight = new THREE.PointLight(0xfff0c0, 2.2, 60, 1.5);
sunGroup.add(sunLight);

// -------------------- Orbit helper rings (faint, kid-friendly) --------------------
function createOrbitRing(radius, color = 0x4466aa) {
  const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2, false, 0);
  const points = curve.getPoints(128);
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(p.x, 0, p.y))
  );
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.22,
  });
  return new THREE.LineLoop(geometry, material);
}

// -------------------- Decorative companion planets --------------------
const companions = [];

function addCompanionPlanet({ radius, distance, color, speed, tilt = 0 }) {
  const pivot = new THREE.Group();
  pivot.rotation.x = tilt;
  scene.add(pivot);

  const geo = new THREE.SphereGeometry(radius, 24, 24);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75,
    metalness: 0.08,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.x = distance;
  pivot.add(mesh);

  scene.add(createOrbitRing(distance, 0x335588));

  companions.push({ pivot, mesh, speed, spin: 0.01 + Math.random() * 0.02 });
}

// Inner rocky world
addCompanionPlanet({
  radius: 0.35,
  distance: 4.2,
  color: 0xc47a5a,
  speed: 0.006,
  tilt: 0.05,
});
// Gas-giant style
addCompanionPlanet({
  radius: 0.7,
  distance: 9.5,
  color: 0x6b8fd4,
  speed: 0.0025,
  tilt: -0.08,
});
// Small outer world
addCompanionPlanet({
  radius: 0.28,
  distance: 12.5,
  color: 0xa0c4ff,
  speed: 0.0018,
  tilt: 0.12,
});

// -------------------- Kid's planet (orbits + spins) --------------------
const KID_ORBIT_RADIUS = 6.8;
const KID_PLANET_BASE_SCALE = 1.0;

const kidOrbitPivot = new THREE.Group();
kidOrbitPivot.rotation.x = 0.08;
scene.add(kidOrbitPivot);
scene.add(createOrbitRing(KID_ORBIT_RADIUS, 0x55aaff));

const planetGeometry = new THREE.SphereGeometry(1.0, 64, 64);
const defaultMaterial = new THREE.MeshStandardMaterial({
  color: 0x3366aa,
  roughness: 0.7,
  metalness: 0.1,
});
const planet = new THREE.Mesh(planetGeometry, defaultMaterial);
planet.position.x = KID_ORBIT_RADIUS;
planet.scale.set(KID_PLANET_BASE_SCALE, KID_PLANET_BASE_SCALE, KID_PLANET_BASE_SCALE);
kidOrbitPivot.add(planet);

const atmosphereGeo = new THREE.SphereGeometry(1.06, 32, 32);
const atmosphereMat = new THREE.MeshBasicMaterial({
  color: 0x4488ff,
  transparent: true,
  opacity: 0.14,
  side: THREE.BackSide,
});
const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
planet.add(atmosphere);

// -------------------- Controls (debug / optional) --------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 28;
controls.target.set(0, 0, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.25;

// -------------------- Texture Loader --------------------
const textureLoader = new THREE.TextureLoader();
let currentPlanetUrl = null;

function applyPlanetTexture(url, name) {
  if (url === currentPlanetUrl) return;
  currentPlanetUrl = url;

  textureLoader.load(
    url,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const newMat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.65,
        metalness: 0.05,
      });

      if (planet.material) planet.material.dispose();
      planet.material = newMat;

      planet.scale.set(0.08, 0.08, 0.08);
      const targetScale = KID_PLANET_BASE_SCALE;
      const start = performance.now();
      const duration = 1200;

      function animateIn(now) {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        const s = 0.08 + (targetScale - 0.08) * ease;
        planet.scale.set(s, s, s);
        if (t < 1) requestAnimationFrame(animateIn);
      }
      requestAnimationFrame(animateIn);

      planetNameEl.textContent = name || 'A new planet!';
      planetNameEl.classList.add('visible');
      statusEl.textContent = 'A new planet has joined the solar system!';

      setTimeout(() => {
        statusEl.textContent = 'Kids Galaxy Projector ready';
      }, 5000);
    },
    undefined,
    (err) => {
      console.error('Failed to load planet texture', err);
      statusEl.textContent = 'Could not load the planet texture';
    }
  );
}

// -------------------- Polling for new planets --------------------
async function checkForNewPlanet() {
  try {
    const res = await fetch('/api/current-planet');
    if (!res.ok) return;
    const data = await res.json();

    if (data.has_planet && data.url) {
      applyPlanetTexture(data.url, data.name);
    }
  } catch (e) {
    // silent - network hiccups are normal
  }
}

setInterval(checkForNewPlanet, 2500);
checkForNewPlanet();

// -------------------- Resize --------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// -------------------- Animation Loop --------------------
const KID_ORBIT_SPEED = 0.004;
const KID_SPIN_SPEED = 0.012;

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  sun.rotation.y += 0.002;
  sunGroup.scale.setScalar(1 + Math.sin(performance.now() * 0.0015) * 0.015);

  kidOrbitPivot.rotation.y += KID_ORBIT_SPEED * (dt * 60);
  planet.rotation.y += KID_SPIN_SPEED * (dt * 60);

  for (const c of companions) {
    c.pivot.rotation.y += c.speed * (dt * 60);
    c.mesh.rotation.y += c.spin * (dt * 60);
  }

  stars.rotation.y += 0.00012 * (dt * 60);

  controls.update();
  renderer.render(scene, camera);
}
animate();

console.log('Kids Galaxy Projector solar system ready');
