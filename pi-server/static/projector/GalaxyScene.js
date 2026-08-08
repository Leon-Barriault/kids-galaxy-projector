import * as THREE from 'three';

/** Owns Three.js scene construction, ambient bodies, lights, and rendering. */
export class GalaxyScene {
  constructor(container, animator) {
    if (!container) throw new Error('Missing #canvas-container');

    this.animator = animator;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050818);
    this.scene.fog = new THREE.FogExp2(0x050818, 0.001);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    this.scene.add(new THREE.AmbientLight(0x8090c0, 0.85));
    const fillLight = new THREE.DirectionalLight(0xaabbff, 0.55);
    fillLight.position.set(0, 8, 20);
    this.scene.add(fillLight);
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

    this.sunGroup.add(new THREE.PointLight(0xfff5d0, 3.4, 100, 1.4));
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

    this.stars.rotation.y += 0.0002;
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
  }
}
