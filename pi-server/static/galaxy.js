/**
 * Kids Galaxy Projector - Three.js visualization
 * Shows a rotating textured planet in a star field.
 * Polls the backend for new planet uploads.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// -------------------- Scene Setup --------------------
const container = document.getElementById('canvas-container');
const planetNameEl = document.getElementById('planet-name');
const statusEl = document.getElementById('status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x02040a, 0.0015);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.5, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Soft ambient + key light
const ambient = new THREE.AmbientLight(0x334466, 0.6);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(5, 8, 5);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x88aaff, 0.5);
rimLight.position.set(-4, 2, -3);
scene.add(rimLight);

// -------------------- Stars --------------------
function createStarField(count = 2500) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 80 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    const c = 0.7 + Math.random() * 0.3;
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

// -------------------- Planet --------------------
const planetGeometry = new THREE.SphereGeometry(1.6, 64, 64);
const defaultMaterial = new THREE.MeshStandardMaterial({
  color: 0x3366aa,
  roughness: 0.7,
  metalness: 0.1,
});
const planet = new THREE.Mesh(planetGeometry, defaultMaterial);
scene.add(planet);

// Subtle atmosphere glow
const atmosphereGeo = new THREE.SphereGeometry(1.68, 32, 32);
const atmosphereMat = new THREE.MeshBasicMaterial({
  color: 0x4488ff,
  transparent: true,
  opacity: 0.12,
  side: THREE.BackSide,
});
const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
planet.add(atmosphere);

// -------------------- Controls (optional for debugging) --------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 3.5;
controls.maxDistance = 12;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

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

      planet.material.dispose();
      planet.material = newMat;

      // Nice arrival animation
      planet.scale.set(0.1, 0.1, 0.1);
      const targetScale = 1.6;
      const start = performance.now();
      const duration = 1200;

      function animateIn(now) {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const s = 0.1 + (targetScale - 0.1) * ease;
        planet.scale.set(s, s, s);
        if (t < 1) requestAnimationFrame(animateIn);
      }
      requestAnimationFrame(animateIn);

      planetNameEl.textContent = name || 'A new planet!';
      planetNameEl.classList.add('visible');
      statusEl.textContent = 'A new planet has arrived in the galaxy!';

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
    // silent – network hiccups are normal
  }
}

// Poll every 2.5 seconds
setInterval(checkForNewPlanet, 2500);
checkForNewPlanet(); // initial

// -------------------- Resize --------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// -------------------- Animation Loop --------------------
function animate() {
  requestAnimationFrame(animate);
  planet.rotation.y += 0.003;
  stars.rotation.y += 0.00015;
  controls.update();
  renderer.render(scene, camera);
}
animate();

console.log('Kids Galaxy Projector ready');
