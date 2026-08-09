import * as THREE from 'three';

import {
  applyMoldedAccentTexture,
  applyPolishedTexture,
  createMoldedAccentMaterial,
  createPolishedFeatureMaterial,
  createPolishedPlanetMaterial,
  POLISHED_SURFACE_PROFILE,
} from './PlanetSurface.js';

const VALID_STYLES = new Set(['classic', 'ringed', 'cratered', 'spiky']);
const VALID_COMPANIONS = new Set(['moon', 'stars', 'satellite', 'astronaut']);
const DEFAULT_RING_COLOR = '#d8a6ff';
const DEFAULT_CRATER_COLOR = '#858c98';
const DEFAULT_MOUNTAIN_COLOR = '#8d6e63';

const CRATER_SPECS = [
  { direction: [0.8, 0.25, 0.5], edge: 0.93, depth: 0.07, radius: 0.19 },
  { direction: [-0.45, 0.75, 0.35], edge: 0.934, depth: 0.078, radius: 0.17 },
  { direction: [0.2, -0.55, 0.82], edge: 0.938, depth: 0.086, radius: 0.21 },
  { direction: [-0.8, -0.2, -0.45], edge: 0.942, depth: 0.094, radius: 0.15 },
  { direction: [0.55, 0.65, -0.5], edge: 0.946, depth: 0.102, radius: 0.14 },
];

const MOUNTAIN_RANGE_SPECS = [
  [0.8, 0.2, 0.55, 0.68, 0.34, 0.31],
  [-0.7, 0.45, 0.5, 0.52, 0.31, 0.23],
  [0.2, 0.9, -0.35, 0.72, 0.38, 0.34],
  [-0.2, -0.85, 0.48, 0.58, 0.32, 0.27],
  [0.65, -0.48, -0.58, 0.48, 0.28, 0.21],
  [-0.75, -0.2, -0.62, 0.64, 0.36, 0.3],
];

const RING_LIGHTNESS_STOPS = [
  [0, -0.08],
  [0.18, -0.03],
  [0.43, 0.13],
  [0.62, 0.07],
  [0.82, -0.06],
  [1, -0.2],
];

function shiftedColor(color, lightnessDelta, saturationDelta = 0) {
  const result = color?.isColor ? color.clone() : new THREE.Color(color);
  return result.offsetHSL(0, saturationDelta, lightnessDelta);
}

function ringLightnessAt(t) {
  for (let index = 1; index < RING_LIGHTNESS_STOPS.length; index += 1) {
    const [rightT, rightValue] = RING_LIGHTNESS_STOPS[index];
    if (t > rightT) continue;
    const [leftT, leftValue] = RING_LIGHTNESS_STOPS[index - 1];
    const local = (t - leftT) / (rightT - leftT);
    return THREE.MathUtils.lerp(leftValue, rightValue, local);
  }
  return RING_LIGHTNESS_STOPS[RING_LIGHTNESS_STOPS.length - 1][1];
}

/** A single kid-created planet and the Three.js resources it owns. */
export class PlanetEntity {
  constructor({ payload, order, gallerySize, scene, animator, celebrate }) {
    this.id = payload.id;
    this.order = order;
    this.timestamp = Number(payload.timestamp) || 0;
    this.scene = scene;
    this.animator = animator;
    this.disposed = false;
    this.reliefMap = null;
    this.accentMask = null;
    this.style = VALID_STYLES.has(payload.style) ? payload.style : 'classic';
    this.ringColor = this.normalizeFeatureColor(payload.ring_color, DEFAULT_RING_COLOR);
    this.craterColor = this.normalizeFeatureColor(payload.crater_color, DEFAULT_CRATER_COLOR);
    this.mountainColor = this.normalizeFeatureColor(
      payload.mountain_color,
      DEFAULT_MOUNTAIN_COLOR,
    );
    this.companionTypes = Array.isArray(payload.companions)
      ? payload.companions.filter((value) => VALID_COMPANIONS.has(value))
      : [];
    this.decorations = [];
    this.companions = [];

    Object.assign(this, animator.orbitParamsFor(payload.id, gallerySize));

    this.mesh = new THREE.Mesh(this.createPlanetGeometry(), createPolishedPlanetMaterial());
    this.accentMesh = new THREE.Mesh(
      this.createPlanetGeometry(POLISHED_SURFACE_PROFILE.accentRadius),
      createMoldedAccentMaterial(),
    );
    this.accentMesh.visible = false;
    this.accentMesh.renderOrder = 1;
    this.mesh.add(this.accentMesh);
    this.mesh.scale.setScalar(celebrate ? 0.01 : 1);
    scene.add(this.mesh);

    if (this.style === 'ringed') this.addPlanetRing();
    if (this.style === 'cratered') this.addCraterDetails();
    if (this.style === 'spiky') this.addMountainRanges();
    this.addSelectedCompanions();

    this.ring = scene.createOrbitRing(this.a, this.e, this.i);
    scene.add(this.ring);

    if (celebrate) animator.scaleIn(this.mesh);
  }

  normalizeFeatureColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  createPlanetGeometry(radius = 1.05) {
    const geometry = new THREE.SphereGeometry(radius, 64, 48);
    if (this.style === 'cratered') this.applyCraterShape(geometry);
    return geometry;
  }

  craterDefinitions() {
    return CRATER_SPECS.map((spec) => ({
      ...spec,
      direction: new THREE.Vector3(...spec.direction).normalize(),
    }));
  }

  applyCraterShape(geometry) {
    const craters = this.craterDefinitions();
    const position = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      normal.copy(vertex).normalize();
      let depression = 0;
      craters.forEach(({ direction, edge, depth }) => {
        const dot = normal.dot(direction);
        if (dot > edge) {
          const x = (dot - edge) / (1 - edge);
          const bowl = Math.pow(Math.sin((x * Math.PI) / 2), 1.7) * depth;
          depression = Math.max(depression, bowl);
        }
      });
      vertex.multiplyScalar(1 - depression);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  createCraterBowlGeometry(radius, depth) {
    const radialSegments = 5;
    const angularSegments = 28;
    const positions = [0, 0, -depth];
    const indices = [];

    for (let ring = 1; ring <= radialSegments; ring += 1) {
      const t = ring / radialSegments;
      const ringRadius = radius * t;
      const z = -depth * (1 - t * t);
      for (let segment = 0; segment < angularSegments; segment += 1) {
        const angle = (segment / angularSegments) * Math.PI * 2;
        positions.push(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, z);
      }
    }

    for (let segment = 0; segment < angularSegments; segment += 1) {
      const next = (segment + 1) % angularSegments;
      indices.push(0, 1 + next, 1 + segment);
    }
    for (let ring = 1; ring < radialSegments; ring += 1) {
      const innerStart = 1 + (ring - 1) * angularSegments;
      const outerStart = 1 + ring * angularSegments;
      for (let segment = 0; segment < angularSegments; segment += 1) {
        const next = (segment + 1) % angularSegments;
        const inner = innerStart + segment;
        const innerNext = innerStart + next;
        const outer = outerStart + segment;
        const outerNext = outerStart + next;
        indices.push(inner, outerNext, outer, inner, innerNext, outerNext);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  addCraterDetails() {
    const outward = new THREE.Vector3(0, 0, 1);
    const bowlColor = shiftedColor(this.craterColor, -0.08, -0.02);
    const bowlMaterial = createPolishedFeatureMaterial(bowlColor, {
      roughness: 0.66,
      clearcoat: 0.1,
    });
    const rimColor = shiftedColor(this.craterColor, 0.1, -0.04);
    const rimMaterial = createPolishedFeatureMaterial(rimColor, {
      roughness: 0.56,
      clearcoat: 0.14,
    });

    this.craterDefinitions().forEach(({ direction, depth, radius }) => {
      const crater = new THREE.Group();
      crater.position.copy(direction).multiplyScalar(1.046);
      crater.quaternion.setFromUnitVectors(outward, direction);

      const bowl = new THREE.Mesh(
        this.createCraterBowlGeometry(radius * 0.9, depth * 0.76),
        bowlMaterial.clone(),
      );
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.91, radius * 0.082, 9, 32),
        rimMaterial.clone(),
      );
      rim.position.z = 0.006;
      crater.add(bowl, rim);
      this.mesh.add(crater);
    });

    bowlMaterial.dispose();
    rimMaterial.dispose();
  }

  mountainDefinitions() {
    const phase = (this.animator.hashId(this.id) % 628) / 100;
    const rotation = new THREE.Matrix4().makeRotationY(phase);
    return MOUNTAIN_RANGE_SPECS.map(([x, y, z, width, depth, height], index) => ({
      direction: new THREE.Vector3(x, y, z).normalize().applyMatrix4(rotation).normalize(),
      width,
      depth,
      height,
      seed: this.animator.hashId(`${this.id}-mountain-range-${index}`),
    }));
  }

  seededUnit(seed, shift) {
    return ((seed >>> shift) & 0xff) / 255;
  }

  createMountainRangeGeometry(width, depth, height, seed) {
    const xSegments = 8;
    const zSegments = 6;
    const positions = [];
    const colors = [];
    const indices = [];
    const baseColor = new THREE.Color(this.mountainColor);
    const phase = this.seededUnit(seed, 1) * Math.PI * 2;
    const peaks = [
      {
        u: -0.43 + this.seededUnit(seed, 4) * 0.18,
        v: -0.18 + this.seededUnit(seed, 7) * 0.28,
        su: 0.28,
        sv: 0.38,
        strength: 0.78 + this.seededUnit(seed, 10) * 0.22,
      },
      {
        u: 0.24 + this.seededUnit(seed, 12) * 0.2,
        v: -0.08 + this.seededUnit(seed, 15) * 0.3,
        su: 0.34,
        sv: 0.34,
        strength: 0.62 + this.seededUnit(seed, 18) * 0.28,
      },
      {
        u: -0.04 + this.seededUnit(seed, 20) * 0.18,
        v: 0.28 + this.seededUnit(seed, 22) * 0.16,
        su: 0.42,
        sv: 0.3,
        strength: 0.36 + this.seededUnit(seed, 24) * 0.2,
      },
    ];

    const gaussian = (u, v, peak) => {
      const du = (u - peak.u) / peak.su;
      const dv = (v - peak.v) / peak.sv;
      return Math.exp(-(du * du + dv * dv) * 1.65) * peak.strength;
    };

    for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
      const v = (zIndex / zSegments) * 2 - 1;
      for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
        const u = (xIndex / xSegments) * 2 - 1;
        const x = u * width * 0.5;
        const z = v * depth * 0.5;
        const radialEnvelope = Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v);
        const ridgeCentre = Math.sin(u * Math.PI * 1.15 + phase) * 0.16;
        const ridge = Math.exp(-Math.pow((v - ridgeCentre) / 0.28, 2)) * 0.22;
        const peakHeight = peaks.reduce((sum, peak) => sum + gaussian(u, v, peak), ridge);
        const elevation = height * radialEnvelope * Math.min(1.15, 0.1 + peakHeight);
        const y = elevation - 0.05;
        positions.push(x, y, z);

        const tone = -0.055 + (elevation / Math.max(height, 0.001)) * 0.15;
        const color = shiftedColor(baseColor, tone, -0.025);
        colors.push(color.r, color.g, color.b);
      }
    }

    const row = xSegments + 1;
    for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
      for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
        const a = zIndex * row + xIndex;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.userData.kidsGalaxyMountainRange = true;
    geometry.userData.width = width;
    geometry.userData.depth = depth;
    geometry.userData.height = height;
    return geometry;
  }

  addMountainRanges() {
    const up = new THREE.Vector3(0, 1, 0);
    this.mountainDefinitions().forEach(({ direction, width, depth, height, seed }) => {
      const material = createPolishedFeatureMaterial(0xffffff, {
        roughness: 0.6,
        clearcoat: 0.11,
      });
      material.vertexColors = true;
      material.needsUpdate = true;

      const range = new THREE.Mesh(
        this.createMountainRangeGeometry(width, depth, height, seed),
        material,
      );
      range.position.copy(direction).multiplyScalar(1.015);
      range.quaternion.setFromUnitVectors(up, direction);
      range.rotateY(this.seededUnit(seed, 3) * Math.PI * 2);
      this.mesh.add(range);
    });
  }

  createRingGradientGeometry(innerRadius = 1.17, outerRadius = 2.08) {
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128, 8);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const base = new THREE.Color(this.ringColor);
    const seed = this.animator.hashId(`${this.id}-ring-wobble`);
    const phaseA = this.seededUnit(seed, 2) * Math.PI * 2;
    const phaseB = this.seededUnit(seed, 10) * Math.PI * 2;

    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const radius = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      const t = THREE.MathUtils.clamp(
        (radius - innerRadius) / (outerRadius - innerRadius),
        0,
        1,
      );

      // Two low-amplitude harmonics give the band the gently handmade edge
      // seen in the reference without turning it into a visibly distorted ring.
      const radialWobble =
        Math.sin(angle * 3 + phaseA) * 0.018 + Math.sin(angle * 7 + phaseB) * 0.009;
      const warpedRadius = radius + radialWobble;
      const radialScale = warpedRadius / Math.max(radius, 0.001);
      const verticalWobble = Math.sin(angle * 2 + phaseB) * 0.006;
      position.setXYZ(index, x * radialScale, y * radialScale, verticalWobble);

      const color = shiftedColor(base, ringLightnessAt(t), -0.035);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.userData.kidsGalaxyRingGradient = true;
    geometry.userData.kidsGalaxyRingWobble = true;
    geometry.userData.innerRadius = innerRadius;
    geometry.userData.outerRadius = outerRadius;
    geometry.userData.wobbleAmplitude = 0.027;
    return geometry;
  }

  addPlanetRing() {
    const material = createPolishedFeatureMaterial(0xffffff, {
      roughness: 0.64,
      clearcoat: 0.08,
      side: THREE.DoubleSide,
    });
    material.vertexColors = true;
    material.needsUpdate = true;

    const ring = new THREE.Mesh(this.createRingGradientGeometry(), material);
    ring.rotation.x = Math.PI / 2.45;
    ring.rotation.z = 0.2;
    this.scene.add(ring);
    this.decorations.push(ring);
  }

  addSelectedCompanions() {
    this.companionTypes.forEach((type, index) => {
      const object = this.createCompanion(type);
      if (!object) return;
      const seed = this.animator.hashId(`${this.id}-${type}`);
      const record = {
        type,
        object,
        orbitRadius: 1.65 + index * 0.32 + (seed % 20) / 100,
        speed: 0.32 + ((seed >> 3) % 25) / 100,
        phase: (seed % 628) / 100 + index * 0.7,
        vertical: 0.18 + ((seed >> 5) % 14) / 100,
      };
      this.scene.add(object);
      this.companions.push(record);
    });
  }

  createCompanion(type) {
    switch (type) {
      case 'moon':
        return new THREE.Mesh(
          new THREE.SphereGeometry(0.24, 24, 20),
          createPolishedFeatureMaterial(0xbfc5d1, { roughness: 0.72, clearcoat: 0.12 }),
        );
      case 'stars':
        return this.createStars();
      case 'satellite':
        return this.createSatellite();
      case 'astronaut':
        return this.createAstronaut();
      default:
        return null;
    }
  }

  createStars() {
    const group = new THREE.Group();
    const positions = [
      [-0.18, 0.06, 0],
      [0.16, 0.16, 0.04],
      [0.08, -0.15, -0.03],
      [-0.05, 0.26, 0.02],
    ];
    positions.forEach((position, index) => {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(index === 0 ? 0.1 : 0.075, 0),
        new THREE.MeshBasicMaterial({ color: index % 2 === 0 ? 0xffef72 : 0xffbd4a }),
      );
      star.position.set(...position);
      group.add(star);
    });
    return group;
  }

  createSatellite() {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6dbe3,
      roughness: 0.35,
      metalness: 0.65,
    });
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x2878d0,
      roughness: 0.45,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.28), bodyMaterial);
    const left = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.025, 0.2),
      panelMaterial.clone(),
    );
    const right = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.025, 0.2),
      panelMaterial.clone(),
    );
    left.position.x = -0.29;
    right.position.x = 0.29;
    group.add(body, left, right);
    group.scale.setScalar(0.9);
    return group;
  }

  createAstronaut() {
    const group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({
      color: 0xf4f6ff,
      roughness: 0.5,
      metalness: 0.08,
    });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x18304f,
      roughness: 0.18,
      metalness: 0.7,
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), suit);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), visor);
    face.position.z = 0.075;
    head.position.y = 0.18;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.23, 0.12), suit.clone());
    const leftArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.035, 0.16, 4, 8),
      suit.clone(),
    );
    const rightArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.035, 0.16, 4, 8),
      suit.clone(),
    );
    leftArm.position.set(-0.14, 0.02, 0);
    rightArm.position.set(0.14, 0.03, 0);
    leftArm.rotation.z = 0.65;
    rightArm.rotation.z = -0.8;
    group.add(head, face, body, leftArm, rightArm);
    group.scale.setScalar(0.9);
    return group;
  }

  update(t, behavior = {}) {
    const speed = Number(behavior.planet_speed) || 1;
    const animatedTime = t * speed;
    this.mesh.position.copy(this.animator.positionOnOrbit(this, animatedTime));
    this.mesh.rotation.y += this.spin * 0.01 * speed;

    this.decorations.forEach((decoration, index) => {
      decoration.position.copy(this.mesh.position);
      decoration.rotation.z += 0.0015 * (index + 1) * speed;
    });
    this.updateCompanions(animatedTime);

    if (behavior.ambient_effects === false) return;
    switch (behavior.theme) {
      case 'halloween':
        this.mesh.position.y += Math.sin(animatedTime * 1.3 + this.M0) * 0.18;
        this.mesh.rotation.z = Math.sin(animatedTime * 0.5 + this.M0) * 0.06;
        break;
      case 'easter':
        this.mesh.position.y += Math.abs(Math.sin(animatedTime * 1.1 + this.M0)) * 0.24;
        this.mesh.rotation.z = 0;
        break;
      case 'christmas':
        this.mesh.position.y += Math.sin(animatedTime * 0.8 + this.M0) * 0.1;
        this.mesh.rotation.z = Math.sin(animatedTime * 0.7 + this.M0) * 0.03;
        break;
      default:
        this.mesh.rotation.z = 0;
    }
  }

  updateCompanions(t) {
    this.companions.forEach((record, index) => {
      const angle = t * record.speed + record.phase;
      const x = this.mesh.position.x + Math.cos(angle) * record.orbitRadius;
      const y = this.mesh.position.y + Math.sin(angle * 1.7) * record.vertical;
      const z = this.mesh.position.z + Math.sin(angle) * record.orbitRadius;
      record.object.position.set(x, y, z);

      if (record.type === 'moon') {
        record.object.rotation.y += 0.006;
      } else if (record.type === 'stars') {
        const twinkle = 0.8 + Math.sin(t * 4 + index) * 0.2;
        record.object.scale.setScalar(twinkle);
        record.object.rotation.z += 0.004;
      } else if (record.type === 'satellite') {
        record.object.lookAt(this.mesh.position);
        record.object.rotation.z += 0.015;
      } else if (record.type === 'astronaut') {
        record.object.rotation.z = Math.sin(t * 0.8 + record.phase) * 0.32;
        record.object.rotation.y += 0.003;
      }
    });
  }

  applyTexture(texture) {
    if (this.disposed) {
      texture.dispose();
      return;
    }

    this.reliefMap = applyPolishedTexture(this.mesh.material, texture, this.scene.renderer);
    this.accentMask = applyMoldedAccentTexture(
      this.accentMesh.material,
      texture,
      this.scene.renderer,
    );
    this.accentMesh.visible = Boolean(this.accentMask);
  }

  disposeObject(object) {
    this.scene.remove(object);
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        const textures = new Set([
          material.map,
          material.alphaMap,
          material.bumpMap,
          material.normalMap,
          material.emissiveMap,
        ]);
        textures.forEach((texture) => texture?.dispose());
        material.dispose();
      });
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeObject(this.mesh);
    this.reliefMap = null;
    this.accentMask = null;
    this.decorations.forEach((object) => this.disposeObject(object));
    this.companions.forEach(({ object }) => this.disposeObject(object));
    this.scene.remove(this.ring);
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
