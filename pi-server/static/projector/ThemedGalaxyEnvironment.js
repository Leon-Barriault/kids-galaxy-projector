import * as THREE from 'three';

import { GalaxyEnvironment } from './GalaxyEnvironment.js';
import {
  createPumpkinStemGeometry,
  createPumpkinStemMaterial,
} from './ThemeVisualFactory.js';
import {
  createThemeBodyGeometry,
  createThemeBodyMaterial,
  instanceColorForThemeBody,
  themeBodyHasStem,
} from './ThemeAsteroidFactory.js';
import {
  normalizeTheme,
  pickAsteroidStyle,
  themeDefinition,
} from './ThemeRegistry.js';

const BELT_BODY_COUNT = 620;
const BELT_DUST_COUNT = 1500;
const SYMBOLIC_STYLES = new Set([
  'easter-egg',
  'golden-egg',
  'ornament',
  'gold-orb',
  'silver-orb',
  'maple-leaf',
  'fleur-de-lis',
  'heart',
]);

function randomBetween(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

function randomDirection() {
  const angle = Math.random() * Math.PI * 2;
  const vertical = randomBetween(-0.34, 0.34);
  return new THREE.Vector3(Math.cos(angle), vertical, Math.sin(angle)).normalize();
}

function disposeObject(scene, object) {
  scene.remove(object);
  object.traverse((child) => {
    child.geometry?.dispose();
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function styleForIndex(theme, index) {
  const unit = (0.173 + index * 0.618033988749895) % 1;
  return pickAsteroidStyle(theme, unit);
}

function bodyScale(style, size, flyby = false) {
  if (SYMBOLIC_STYLES.has(style)) return new THREE.Vector3(size, size, size);
  if (flyby) {
    return new THREE.Vector3(
      size,
      size * randomBetween(0.8, 1.18),
      size * randomBetween(0.8, 1.18),
    );
  }
  return new THREE.Vector3(
    size * randomBetween(0.72, 1.32),
    size * randomBetween(0.72, 1.22),
    size * randomBetween(0.72, 1.32),
  );
}

function createDescriptors(theme, count, transformFactory) {
  const descriptors = [];
  for (let index = 0; index < count; index += 1) {
    const style = styleForIndex(theme, index);
    descriptors.push({
      index,
      style,
      matrix: transformFactory(style, index),
    });
  }
  return descriptors;
}

function createInstancedBodies(descriptors, radius, marker) {
  const group = new THREE.Group();
  const byStyle = new Map();
  descriptors.forEach((descriptor) => {
    if (!byStyle.has(descriptor.style)) byStyle.set(descriptor.style, []);
    byStyle.get(descriptor.style).push(descriptor);
  });

  for (const [style, entries] of byStyle.entries()) {
    const bodies = new THREE.InstancedMesh(
      createThemeBodyGeometry(style, radius),
      createThemeBodyMaterial(style),
      entries.length,
    );
    bodies.castShadow = true;
    bodies.receiveShadow = true;
    bodies.userData[marker] = true;
    bodies.userData.kidsGalaxyThemedAsteroids = true;
    bodies.userData.kidsGalaxyAsteroidStyle = style;
    bodies.userData.instanceCount = entries.length;

    entries.forEach((descriptor, localIndex) => {
      bodies.setMatrixAt(localIndex, descriptor.matrix);
      const color = instanceColorForThemeBody(style, descriptor.index);
      if (color) bodies.setColorAt(localIndex, color);
    });
    bodies.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    group.add(bodies);

    if (themeBodyHasStem(style)) {
      const stems = new THREE.InstancedMesh(
        createPumpkinStemGeometry(radius),
        createPumpkinStemMaterial(),
        entries.length,
      );
      stems.castShadow = true;
      stems.receiveShadow = true;
      stems.userData.kidsGalaxyPumpkinStems = true;
      stems.userData.kidsGalaxyAsteroidStyle = style;
      entries.forEach((descriptor, localIndex) => {
        stems.setMatrixAt(localIndex, descriptor.matrix);
      });
      stems.instanceMatrix.needsUpdate = true;
      group.add(stems);
    }
  }

  group.userData.kidsGalaxyMixedThemeBodies = true;
  group.userData.bodyCount = descriptors.length;
  group.userData.styles = [...byStyle.keys()];
  return group;
}

function createBeltDescriptors(theme) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();

  return createDescriptors(theme, BELT_BODY_COUNT, (style) => {
    const angle = Math.random() * Math.PI * 2;
    const orbitalRadius = randomBetween(17.5, 23.5);
    position.set(
      Math.cos(angle) * orbitalRadius,
      randomBetween(-0.9, 0.9),
      Math.sin(angle) * orbitalRadius,
    );
    euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    quaternion.setFromEuler(euler);
    const scale = bodyScale(style, randomBetween(0.55, 1.8));
    return matrix.clone().compose(position, quaternion, scale);
  });
}

function createBeltDust(theme) {
  const definition = themeDefinition(theme);
  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(BELT_DUST_COUNT * 3);
  for (let index = 0; index < BELT_DUST_COUNT; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const orbitalRadius = randomBetween(17.2, 23.8);
    dustPositions[index * 3] = Math.cos(angle) * orbitalRadius;
    dustPositions[index * 3 + 1] = randomBetween(-1.0, 1.0);
    dustPositions[index * 3 + 2] = Math.sin(angle) * orbitalRadius;
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: definition.dustColor,
      size: theme === 'default' ? 0.065 : 0.055,
      transparent: true,
      opacity: theme === 'remembrance-day' ? 0.2 : theme === 'default' ? 0.42 : 0.3,
      sizeAttenuation: true,
      depthWrite: false,
    }),
  );
  dust.userData.kidsGalaxyAsteroidBeltDust = true;
  dust.userData.kidsGalaxyTheme = theme;
  return dust;
}

function themedBelt() {
  const theme = normalizeTheme(this.settings?.theme);
  const group = new THREE.Group();
  group.userData.kidsGalaxyAsteroidBelt = true;
  group.userData.kidsGalaxyTheme = theme;
  group.userData.kidsGalaxyAsteroidStyle = 'mixed';
  group.userData.rockCount = BELT_BODY_COUNT;
  group.rotation.x = 0.08;
  group.rotation.z = -0.04;

  const bodies = createInstancedBodies(
    createBeltDescriptors(theme),
    0.16,
    'kidsGalaxyAsteroidBeltRocks',
  );
  group.add(bodies, createBeltDust(theme));
  return group;
}

function createFlybyDescriptors(theme, count) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();

  return createDescriptors(theme, count, (style) => {
    position.set(
      randomBetween(-1.8, 1.8),
      randomBetween(-1.1, 1.1),
      randomBetween(-1.5, 1.5),
    );
    euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    quaternion.setFromEuler(euler);
    const scale = bodyScale(style, randomBetween(0.55, 1.4), true);
    return matrix.clone().compose(position, quaternion, scale);
  });
}

function themedFlyby() {
  const theme = normalizeTheme(this.settings?.theme);
  const direction = randomDirection();
  const start = direction.clone().multiplyScalar(randomBetween(29, 34));
  const end = direction.clone().multiplyScalar(-randomBetween(29, 34));
  const offset = randomDirection().multiplyScalar(randomBetween(7, 13));
  start.add(offset);
  end.add(offset);

  const group = new THREE.Group();
  group.userData.kidsGalaxyAsteroidFlyby = true;
  group.userData.kidsGalaxyTheme = theme;
  group.userData.kidsGalaxyAsteroidStyle = 'mixed';

  const count = 8 + Math.floor(Math.random() * 5);
  const bodies = createInstancedBodies(
    createFlybyDescriptors(theme, count),
    0.26,
    'kidsGalaxyAsteroidFlybyRocks',
  );
  group.add(bodies);
  this.scene.add(group);

  this.flybys.push({
    group,
    start,
    end,
    bornAt: this.lastTime,
    lifetime: randomBetween(9, 13),
    spin: randomBetween(-0.014, 0.014),
  });
}

/** Install registry-driven mixed holiday substitutions for belts and fly-bys. */
export function installThemedGalaxyEnvironment() {
  const originalApplyBehavior = GalaxyEnvironment.prototype.applyBehavior;
  if (originalApplyBehavior?.kidsGalaxyThemedEnvironment) return;

  GalaxyEnvironment.prototype.createAsteroidBelt = themedBelt;
  GalaxyEnvironment.prototype.spawnFlyby = themedFlyby;

  function themedApplyBehavior(behavior) {
    const nextTheme = normalizeTheme(behavior?.theme);
    const previousTheme = normalizeTheme(this.settings?.theme);
    const hadBelt = Boolean(this.asteroidBelt);
    this.settings.theme = nextTheme;
    originalApplyBehavior.call(this, behavior);
    this.settings.theme = nextTheme;

    if (nextTheme === previousTheme) return;

    if (hadBelt && this.asteroidBelt) {
      disposeObject(this.scene, this.asteroidBelt);
      this.asteroidBelt = null;
      if (this.settings.asteroidBeltEnabled) {
        this.asteroidBelt = this.createAsteroidBelt();
        this.scene.add(this.asteroidBelt);
      }
    }

    if (this.flybys.length) this.clearFlybys();
    if (this.settings.flybyAsteroidsEnabled) {
      this.nextFlybyAt = this.lastTime + randomBetween(2.5, 5.5);
    }
  }
  themedApplyBehavior.kidsGalaxyThemedEnvironment = true;
  GalaxyEnvironment.prototype.applyBehavior = themedApplyBehavior;
}
