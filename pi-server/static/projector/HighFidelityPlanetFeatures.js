import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';
import {
  createChristmasTree,
  createWhiteBunny,
  createWitchOnBroom,
} from './ThemeVisualFactory.js';
import { normalizeTheme } from './ThemeRegistry.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function seededRandom(seed) {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function tangentFrame(direction) {
  const helper = Math.abs(direction.y) < 0.84
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(helper, direction).normalize();
  const v = new THREE.Vector3().crossVectors(direction, u).normalize();
  return { u, v };
}

function craterBoundary(definition, angle) {
  return (
    1 +
    Math.sin(angle * 3 + definition.phase) * definition.irregularity +
    Math.sin(angle * 5 - definition.phase * 0.7) * definition.irregularity * 0.45
  );
}

function highFidelityCraterDefinitions() {
  const seed = this.animator.hashId(`${this.id}-craters-v3`);
  const random = seededRandom(seed);
  const count = 9 + Math.floor(random() * 5);
  const phase = random() * Math.PI * 2;
  const definitions = [];

  for (let index = 0; index < count; index += 1) {
    const y = 1 - ((index + 0.55) / count) * 2;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phase + index * GOLDEN_ANGLE + (random() - 0.5) * 0.34;
    const direction = new THREE.Vector3(
      Math.cos(theta) * radial,
      y,
      Math.sin(theta) * radial,
    ).normalize();

    let radius = 0.105 + random() * 0.15;
    if (index === 0) radius = 0.275 + random() * 0.055;
    else if (index === 1) radius = 0.215 + random() * 0.055;
    // Preserve an obvious scale hierarchy for every deterministic planet id.
    // Without a guaranteed small crater, some seeds made every remaining crater
    // medium-sized and the visual/acceptance contract became probabilistic.
    else if (index === 2) radius = 0.105 + random() * 0.025;

    const depth = 0.095 + random() * 0.09 + radius * 0.08;
    const aspect = 0.78 + random() * 0.44;
    const inverseAspect = 0.86 + random() * 0.3;
    const frame = tangentFrame(direction);
    definitions.push({
      direction,
      radius,
      depth,
      aspectX: aspect,
      aspectY: inverseAspect,
      rotation: random() * Math.PI * 2,
      irregularity: 0.025 + random() * 0.055,
      phase: random() * Math.PI * 2,
      rimRadius: radius * (0.065 + random() * 0.04),
      rimHeight: 0.008 + random() * 0.018,
      u: frame.u,
      v: frame.v,
      seed: this.animator.hashId(`${this.id}-crater-${index}`),
    });
  }
  return definitions;
}

function highFidelityPlanetGeometry(radius = 1.05) {
  const geometry = new THREE.SphereGeometry(radius, 112, 84);
  if (this.style === 'cratered') this.applyCraterShape(geometry);
  return geometry;
}

function deepCraterShape(geometry) {
  const craters = this.craterDefinitions();
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    normal.copy(vertex).normalize();
    let depression = 0;

    for (const crater of craters) {
      const facing = normal.dot(crater.direction);
      if (facing <= 0.86) continue;

      const scale = crater.radius / 1.05;
      let x = normal.dot(crater.u) / Math.max(scale, 0.001);
      let y = normal.dot(crater.v) / Math.max(scale, 0.001);
      const cosine = Math.cos(crater.rotation);
      const sine = Math.sin(crater.rotation);
      const rotatedX = x * cosine - y * sine;
      const rotatedY = x * sine + y * cosine;
      x = rotatedX / crater.aspectX;
      y = rotatedY / crater.aspectY;

      const angle = Math.atan2(y, x);
      const boundary = craterBoundary(crater, angle);
      const distance = Math.hypot(x, y) / Math.max(boundary, 0.7);
      if (distance >= 1) continue;

      const bowl = Math.pow(1 - distance * distance, 1.45) * crater.depth;
      depression = Math.max(depression, bowl);
    }

    vertex.multiplyScalar(1 - depression);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function craterBowlGeometry(definition) {
  const radialSegments = 9;
  const angularSegments = 72;
  const positions = [0, 0, -definition.depth * 0.92];
  const indices = [];

  for (let ring = 1; ring <= radialSegments; ring += 1) {
    const t = ring / radialSegments;
    const z = -definition.depth * 0.92 * (1 - Math.pow(t, 1.65));
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const angle = (segment / angularSegments) * Math.PI * 2;
      const boundary = craterBoundary(definition, angle);
      const ringRadius = definition.radius * 0.92 * t * boundary;
      positions.push(
        Math.cos(angle) * ringRadius * definition.aspectX,
        Math.sin(angle) * ringRadius * definition.aspectY,
        z,
      );
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
  geometry.userData.kidsGalaxyCraterBowl = true;
  geometry.userData.radius = definition.radius;
  geometry.userData.depth = definition.depth;
  geometry.userData.aspectRatio = definition.aspectX / definition.aspectY;
  geometry.userData.irregularity = definition.irregularity;
  return geometry;
}

function craterRimGeometry(definition) {
  const points = [];
  const segments = 80;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const boundary = craterBoundary(definition, angle);
    const radius = definition.radius * 0.94 * boundary;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius * definition.aspectX,
        Math.sin(angle) * radius * definition.aspectY,
        definition.rimHeight,
      ),
    );
  }
  const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.45);
  const geometry = new THREE.TubeGeometry(curve, 96, definition.rimRadius, 12, true);
  geometry.userData.kidsGalaxyCraterRim = true;
  geometry.userData.radius = definition.radius;
  geometry.userData.rimRadius = definition.rimRadius;
  return geometry;
}

function deepCraterDetails() {
  const outward = new THREE.Vector3(0, 0, 1);
  this.craterDefinitions().forEach((definition, index) => {
    const bowlColor = new THREE.Color(this.craterColor).offsetHSL(0, -0.025, -0.12 - index * 0.003);
    const rimColor = new THREE.Color(this.craterColor).offsetHSL(0, -0.035, 0.07);
    const bowlMaterial = new THREE.MeshPhysicalMaterial({
      color: bowlColor,
      roughness: 0.72,
      metalness: 0.002,
      clearcoat: 0.04,
      clearcoatRoughness: 0.8,
    });
    const rimMaterial = new THREE.MeshPhysicalMaterial({
      color: rimColor,
      roughness: 0.58,
      metalness: 0.003,
      clearcoat: 0.08,
      clearcoatRoughness: 0.68,
    });

    const crater = new THREE.Group();
    crater.userData.kidsGalaxyCrater = true;
    crater.userData.radius = definition.radius;
    crater.userData.depth = definition.depth;
    crater.userData.aspectRatio = definition.aspectX / definition.aspectY;
    crater.position.copy(definition.direction).multiplyScalar(1.047);
    crater.quaternion.setFromUnitVectors(outward, definition.direction);
    crater.rotateZ(definition.rotation);

    const bowl = new THREE.Mesh(craterBowlGeometry(definition), bowlMaterial);
    const rim = new THREE.Mesh(craterRimGeometry(definition), rimMaterial);
    bowl.castShadow = true;
    bowl.receiveShadow = true;
    rim.castShadow = true;
    rim.receiveShadow = true;
    crater.add(bowl, rim);
    this.mesh.add(crater);
  });
}

function disposeChild(object) {
  object.parent?.remove(object);
  object.traverse((child) => {
    child.geometry?.dispose();
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function enableShadows(object) {
  object?.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function addChristmasTrees() {
  const up = new THREE.Vector3(0, 1, 0);
  this._themeHolidayDecorations ||= [];
  this.mountainDefinitions().slice(0, 6).forEach(({ direction, width, depth, seed }, rangeIndex) => {
    const cluster = new THREE.Group();
    cluster.userData.kidsGalaxyChristmasTreeCluster = true;
    cluster.userData.kidsGalaxyChristmasPreservesTerrain = true;
    cluster.userData.treeCount = 0;
    cluster.position.copy(direction).multiplyScalar(1.015);
    cluster.quaternion.setFromUnitVectors(up, direction);
    cluster.rotateY(this.seededUnit(seed, 3) * Math.PI * 2);

    const random = seededRandom(seed);
    const treeCount = 3 + Math.floor(random() * 4);
    for (let index = 0; index < treeCount; index += 1) {
      const tree = createChristmasTree(
        this.animator.hashId(`${this.id}-tree-${rangeIndex}-${index}`),
        this.mountainColor,
      );
      const scale = 0.58 + random() * 0.62;
      tree.scale.multiplyScalar(scale);
      tree.position.set(
        (random() - 0.5) * width * 0.72,
        -0.025,
        (random() - 0.5) * depth * 0.72,
      );
      tree.rotation.y = random() * Math.PI * 2;
      cluster.add(tree);
      cluster.userData.treeCount += 1;
    }
    enableShadows(cluster);
    this.mesh.add(cluster);
    this._themeHolidayDecorations.push(cluster);
  });
}

function companionKind(object) {
  if (object?.userData?.kidsGalaxyWitchOnBroom) return 'witch';
  if (object?.userData?.kidsGalaxyWhiteBunny) return 'bunny';
  return 'astronaut';
}

/** Install laptop-grade crater geometry and holiday planet substitutions. */
export function installHighFidelityPlanetFeatures() {
  if (PlanetEntity.prototype.update?.kidsGalaxyHighFidelity) return;

  const originalAddMountainRanges = PlanetEntity.prototype.addMountainRanges;
  const originalCreateCompanion = PlanetEntity.prototype.createCompanion;
  const originalUpdate = PlanetEntity.prototype.update;
  const originalApplyTexture = PlanetEntity.prototype.applyTexture;
  const originalAddPlanetRing = PlanetEntity.prototype.addPlanetRing;

  PlanetEntity.prototype.craterDefinitions = highFidelityCraterDefinitions;
  PlanetEntity.prototype.createPlanetGeometry = highFidelityPlanetGeometry;
  PlanetEntity.prototype.applyCraterShape = deepCraterShape;
  PlanetEntity.prototype.addCraterDetails = deepCraterDetails;

  PlanetEntity.prototype.addMountainRanges = function trackedMountainRanges() {
    const before = new Set(this.mesh.children);
    originalAddMountainRanges.call(this);
    this._themeTerrainFeatures = this.mesh.children.filter(
      (child) => !before.has(child) && child.geometry?.userData?.kidsGalaxyMountainRange,
    );
    this._themeTerrainFeatures.forEach(enableShadows);
  };

  PlanetEntity.prototype.addPlanetRing = function highQualityRing() {
    originalAddPlanetRing.call(this);
    enableShadows(this.decorations[this.decorations.length - 1]);
  };

  PlanetEntity.prototype.applyTexture = function highQualityTexture(texture) {
    originalApplyTexture.call(this, texture);
    enableShadows(this.mesh);
  };

  function syncThemeVisuals(theme) {
    const normalized = normalizeTheme(theme);
    const previous = this._kidsGalaxyVisualTheme || 'default';
    if (normalized === previous) return;

    // Holiday scenery is additive. Kid-authored mountains remain authoritative
    // and are never removed simply because a seasonal theme becomes active.
    (this._themeHolidayDecorations || []).forEach(disposeChild);
    this._themeHolidayDecorations = [];
    if (this.style === 'spiky' && normalized === 'christmas') {
      addChristmasTrees.call(this);
    }

    this.companions.forEach((record, index) => {
      if (record.type !== 'astronaut') return;
      const easterSeed = this.animator.hashId(`${this.id}-easter-bunny-${index}`);
      const desiredKind = normalized === 'halloween'
        ? 'witch'
        : normalized === 'easter' && easterSeed % 2 === 0
          ? 'bunny'
          : 'astronaut';
      if (companionKind(record.object) === desiredKind) return;

      this.disposeObject(record.object);
      if (desiredKind === 'witch') record.object = createWitchOnBroom();
      else if (desiredKind === 'bunny') record.object = createWhiteBunny();
      else record.object = originalCreateCompanion.call(this, 'astronaut');
      enableShadows(record.object);
      this.scene.add(record.object);
    });

    this._kidsGalaxyVisualTheme = normalized;
  }

  function highFidelityUpdate(t, behavior = {}) {
    syncThemeVisuals.call(this, behavior?.theme);
    originalUpdate.call(this, t, behavior);
  }
  highFidelityUpdate.kidsGalaxyHighFidelity = true;
  PlanetEntity.prototype.update = highFidelityUpdate;
}
