import * as THREE from 'three';

import { applyPiRenderBudget } from './ProjectorQuality.js';

const THEMES = {
  default: {
    background: 0x050818,
    ambient: 0x8090c0,
    ambientIntensity: 0.14,
    fill: 0x7186b8,
    fillIntensity: 0.09,
    particles: null,
  },
  halloween: {
    background: 0x10051d,
    ambient: 0x8d6bbd,
    ambientIntensity: 0.13,
    fill: 0x8b5f9e,
    fillIntensity: 0.1,
    particles: [0xff8a2b, 0xa66cff, 0x75ff76],
  },
  easter: {
    background: 0x11172f,
    ambient: 0xb9b7ff,
    ambientIntensity: 0.16,
    fill: 0x95a2d9,
    fillIntensity: 0.1,
    particles: [0xffb7d9, 0xffe69a, 0xaeefff, 0xc8f7b2],
  },
  christmas: {
    background: 0x03120f,
    ambient: 0x8fcbb0,
    ambientIntensity: 0.14,
    fill: 0x6e9f8e,
    fillIntensity: 0.09,
    particles: [0xff4f4f, 0x63df84, 0xffd66b, 0xf4f8ff],
  },
};

/** Owns Three.js scene construction, ambient bodies, lights, and rendering. */
export class GalaxyScene {
  constructor(container, animator) {
    if (!container) throw new Error('Missing #canvas-container');

    this.animator = animator;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THEMES.default.background);
    this.scene.fog = new THREE.FogExp2(THEMES.default.background, 0.001);
    this.seasonalParticles = null;
    this.starRotationSpeed = 0.0002;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    applyPiRenderBudget(
      this.renderer,
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio,
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);

    this.addLights();
    this.stars = this.createStarField();
    this.scene.add(this.stars);

    this.sunGroup = new THREE.Group();
    this.scene.add(this.sunGroup);
    this.sun = this.createSun();

    this.companions = [];
    this.addCompanion(0.35, 0x88aaff, 5.0, 0.05, 0.1, 1.0);
    this.addCompanion(0.5, 0xffaa77, 9.0, 0.08, -0.15, 0.7);
    this.addCompanion(0.4, 0xaaffcc, 13.0, 0.04, 0.2, 0.5);
  }

  addLights() {
    // These lights only keep the projector's night side readable. They carry
    // no directional cue: the actual sun at the galaxy origin is the dominant
    // key light for planet highlights, crater rims, and mountain relief.
    this.ambientLight = new THREE.AmbientLight(0x8090c0, THEMES.default.ambientIntensity);
    this.scene.add(this.ambientLight);
    this.fillLight = new THREE.HemisphereLight(
      THEMES.default.fill,
      0x080b16,
      THEMES.default.fillIntensity,
    );
    this.scene.add(this.fillLight);
  }

  createStarField(count = 3200) {
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
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.85;
        colors[i * 3 + 2] = 0.55;
      } else if (roll < 0.35) {
        colors[i * 3] = 0.7;
        colors[i * 3 + 1] = 0.85;
        colors[i * 3 + 2] = 1.0;
      } else {
        const c = 0.75 + Math.random() * 0.25;
        colors[i * 3] = c;
        colors[i * 3 + 1] = c;
        colors[i * 3 + 2] = c;
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

  createSun() {
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(1.85, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe066 }),
    );
    this.sunGroup.add(sun);

    [
      { r: 2.2, color: 0xffb020, opacity: 0.32 },
      { r: 2.8, color: 0xff8800, opacity: 0.14 },
      { r: 3.5, color: 0xff6600, opacity: 0.06 },
    ].forEach(({ r, color, opacity }) => {
      this.sunGroup.add(
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

    // The gallery compresses astronomical distances into 6.5-14.75 scene
    // units. A high intensity with inverse-square falloff keeps the actual sun
    // visually dominant even for the outermost kid planet, while ACES tone
    // mapping keeps the inner planets from clipping.
    this.sunLight = new THREE.PointLight(0xfff1cf, 90, 130, 2);
    this.sunGroup.add(this.sunLight);
    return sun;
  }

  createOrbitRing(a, e, inclination, color = 0x4fc3f7, opacity = 0.3) {
    const segments = 160;
    const points = [];
    for (let k = 0; k <= segments; k++) {
      const M = (k / segments) * Math.PI * 2;
      const E = this.animator.solveKepler(M, e);
      const cosE = Math.cos(E);
      const r = a * (1 - e * cosE);
      const xOrb = r * (cosE - e);
      const yOrb = r * Math.sqrt(1 - e * e) * Math.sin(E);
      points.push(
        new THREE.Vector3(
          xOrb,
          yOrb * Math.sin(inclination),
          yOrb * Math.cos(inclination),
        ),
      );
    }

    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
  }

  addCompanion(radius, color, a, e, inclination, periodScale) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 24),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.05,
      }),
    );
    this.scene.add(mesh);
    this.scene.add(this.createOrbitRing(a, e, inclination, color, 0.18));
    this.companions.push({
      mesh,
      a,
      e,
      i: inclination,
      n: this.animator.meanMotion(a) * periodScale,
      M0: Math.random() * Math.PI * 2,
    });
  }

  applyBehavior(behavior) {
    const selected = THEMES[behavior?.theme] || THEMES.default;
    this.scene.background.setHex(selected.background);
    this.scene.fog.color.setHex(selected.background);
    this.ambientLight.color.setHex(selected.ambient);
    this.ambientLight.intensity = selected.ambientIntensity;
    this.fillLight.color.setHex(selected.fill);
    this.fillLight.intensity = selected.fillIntensity;
    this.starRotationSpeed = behavior?.ambient_effects === false ? 0.0002 : 0.00035;

    this.disposeSeasonalParticles();
    if (behavior?.ambient_effects !== false && selected.particles) {
      this.seasonalParticles = this.createSeasonalParticles(selected.particles);
      this.scene.add(this.seasonalParticles);
    }
  }

  createSeasonalParticles(palette, count = 420) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const r = 18 + Math.random() * 45;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 30;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * r;

      color.setHex(palette[i % palette.length]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.28,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    );
  }

  disposeSeasonalParticles() {
    if (!this.seasonalParticles) return;
    this.scene.remove(this.seasonalParticles);
    this.seasonalParticles.geometry.dispose();
    this.seasonalParticles.material.dispose();
    this.seasonalParticles = null;
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }

  update(t) {
    this.sun.rotation.y += 0.003;
    this.sunGroup.scale.setScalar(1 + Math.sin(t * 1.6) * 0.02);

    for (const companion of this.companions) {
      companion.mesh.position.copy(this.animator.positionOnOrbit(companion, t));
      companion.mesh.rotation.y += 0.01;
    }

    this.stars.rotation.y += this.starRotationSpeed;
    if (this.seasonalParticles) {
      this.seasonalParticles.rotation.y -= 0.0008;
      this.seasonalParticles.rotation.x = Math.sin(t * 0.08) * 0.04;
    }
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }
}
