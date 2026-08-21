import * as THREE from 'three';

import { applyPiRenderBudget } from './ProjectorQuality.js';
import { normalizeTheme, themeDefinition } from './ThemeRegistry.js';

/** Owns Three.js scene construction, ambient bodies, lights, and rendering. */
export class GalaxyScene {
  constructor(container, animator) {
    if (!container) throw new Error('Missing #canvas-container');

    this.animator = animator;
    this.scene = new THREE.Scene();
    const defaultTheme = themeDefinition('default');
    this.scene.background = new THREE.Color(defaultTheme.background);
    this.scene.fog = new THREE.FogExp2(defaultTheme.background, 0.001);
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
    // Khronos PBR Neutral rather than ACES Filmic. ACES is a film-emulation
    // curve: it desaturates on its way to white and drags hue with it, which is
    // right for photographic footage and wrong for a wall of flat saturated
    // poster paint. Measured across the tablet's own palette it was costing
    // about 16/255 of chroma per swatch and pulling every hue roughly 1.4
    // degrees off the colour the child actually picked - a blue arriving as a
    // pale grey-blue, a yellow arriving nearly white.
    //
    // The exposure is not a re-guess. ACES scales by exposure/0.6 internally
    // before its curve, so a like-for-like swap needs a *higher* number, not a
    // lower one, and eyeballing it would have gone the wrong way. 1.91 is the
    // value that holds mid-grey (168 -> 164 of 255) and mean picture brightness
    // (136.1 -> 136.2) across the palette and a nine-stop irradiance sweep.
    // scripts/js/derive_tone_exposure.mjs solves it from the two curves exactly
    // as vendored - `make check-render-math` re-derives it.
    // Highlight clipping drops from 9.3% of samples to none, because Neutral
    // asymptotes toward white where ACES saturates hard against it.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.91;
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
    const defaultTheme = themeDefinition('default');
    this.ambientLight = new THREE.AmbientLight(
      defaultTheme.ambient,
      defaultTheme.ambientIntensity,
    );
    this.scene.add(this.ambientLight);
    this.fillLight = new THREE.HemisphereLight(
      defaultTheme.fill,
      0x080b16,
      defaultTheme.fillIntensity,
    );
    this.scene.add(this.fillLight);
  }

  createStarField(count = 3200) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
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
    // visually dominant even for the outermost kid planet, while tone mapping
    // keeps the inner planets from clipping.
    this.sunLight = new THREE.PointLight(0xfff1cf, 92, 130, 2);
    this.sunGroup.add(this.sunLight);
    return sun;
  }

  createOrbitRing(a, _e, inclination, color = 0x4fc3f7, opacity = 0.3) {
    const segments = 160;
    const points = [];
    for (let k = 0; k < segments; k += 1) {
      const angle = (k / segments) * Math.PI * 2;
      const xOrb = a * Math.cos(angle);
      const yOrb = a * Math.sin(angle);
      points.push(
        new THREE.Vector3(
          xOrb,
          yOrb * Math.sin(inclination),
          yOrb * Math.cos(inclination),
        ),
      );
    }

    // These are deliberately perfect circular guide lines. Organic edge
    // movement belongs only to the physical ring attached to a ringed planet.
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.userData.kidsGalaxyOrbitGuide = true;
    geometry.userData.kidsGalaxyRingWobble = false;
    geometry.userData.kidsGalaxyCircularGuide = true;
    geometry.userData.radius = a;
    return new THREE.LineLoop(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
  }

  addCompanion(radius, color, a, _e, inclination, periodScale) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 24),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.05,
      }),
    );
    this.scene.add(mesh);
    this.scene.add(this.createOrbitRing(a, 0, inclination, color, 0.18));
    this.companions.push({
      mesh,
      a,
      e: 0,
      i: inclination,
      n: this.animator.meanMotion(a) * periodScale,
      M0: Math.random() * Math.PI * 2,
    });
  }

  applyBehavior(behavior) {
    const theme = normalizeTheme(behavior?.theme);
    const selected = themeDefinition(theme);
    this.scene.background.setHex(selected.background);
    this.scene.fog.color.setHex(selected.background);
    this.ambientLight.color.setHex(selected.ambient);
    this.ambientLight.intensity = selected.ambientIntensity;
    this.fillLight.color.setHex(selected.fill);
    this.fillLight.intensity = selected.fillIntensity;

    const ambientEnabled = behavior?.ambient_effects !== false;
    this.starRotationSpeed = ambientEnabled
      ? selected.starRotationSpeed
      : theme === 'remembrance-day'
        ? 0.00005
        : 0.0002;

    this.disposeSeasonalParticles();
    if (!ambientEnabled || !selected.particles?.length) return;

    this.seasonalParticles = this.createSeasonalParticles(
      selected.particles,
      selected.particleCount,
    );
    this.seasonalParticles.material.size = selected.particleSize;
    this.seasonalParticles.material.opacity = selected.particleOpacity;
    this.seasonalParticles.userData.kidsGalaxySeasonalTheme = theme;
    this.seasonalParticles.userData.kidsGalaxyThemeRegistry = true;
    this.scene.add(this.seasonalParticles);
  }

  createSeasonalParticles(palette, count = 420) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < count; i += 1) {
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
