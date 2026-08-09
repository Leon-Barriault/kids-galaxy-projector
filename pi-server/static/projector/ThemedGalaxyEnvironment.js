import * as THREE from 'three';

import { GalaxyEnvironment } from './GalaxyEnvironment.js';
import {
  asteroidStyleForTheme,
  createAsteroidGeometry,
  createAsteroidMaterial,
  createPumpkinStemGeometry,
  createPumpkinStemMaterial,
  easterEggColorFor,
  normalizeTheme,
} from './ThemeVisualFactory.js';

const BELT_BODY_COUNT = 620;
const BELT_DUST_COUNT = 1500;

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

function applyThemeInstanceColor(bodies, style, index) {
  if (style !== 'easter-egg') return;
  const color = easterEggColorFor(index).offsetHSL(
    (index % 5) * 0.006 - 0.012,
    0.015,
    (index % 3) * 0.012 - 0.008,
  );
  bodies.setColorAt(index, color);
}

function themedBelt() {
  const theme = normalizeTheme(this.settings?.theme);
  const style = asteroidStyleForTheme(theme);
  const group = new THREE.Group();
  group.userData.kidsGalaxyAsteroidBelt = true;
  group.userData.kidsGalaxyTheme = theme;
  group.userData.kidsGalaxyAsteroidStyle = style;
  group.rotation.x = 0.08;
  group.rotation.z = -0.04;

  const radius = 0.16;
  const geometry = createAsteroidGeometry(theme, radius);
  const material = createAsteroidMaterial(theme);
  const bodies = new THREE.InstancedMesh(geometry, material, BELT_BODY_COUNT);
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  bodies.userData.kidsGalaxyAsteroidBeltRocks = true;
  bodies.userData.kidsGalaxyThemedAsteroids = true;
  bodies.userData.kidsGalaxyAsteroidStyle = style;
  bodies.userData.rockCount = BELT_BODY_COUNT;
  if (style === 'easter-egg') bodies.userData.kidsGalaxyPastelEggs = true;

  const stems = style === 'pumpkin'
    ? new THREE.InstancedMesh(
        createPumpkinStemGeometry(radius),
        createPumpkinStemMaterial(),
        BELT_BODY_COUNT,
      )
    : null;
  if (stems) {
    stems.castShadow = true;
    stems.receiveShadow = true;
    stems.userData.kidsGalaxyPumpkinStems = true;
  }

  const matrix = new THREE.Matrix4();
  const stemMatrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const localStemScale = new THREE.Matrix4();

  for (let index = 0; index < BELT_BODY_COUNT; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const orbitalRadius = randomBetween(17.5, 23.5);
    position.set(
      Math.cos(angle) * orbitalRadius,
      randomBetween(-0.9, 0.9),
      Math.sin(angle) * orbitalRadius,
    );
    euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    quaternion.setFromEuler(euler);
    const size = randomBetween(0.55, 1.8);
    if (style === 'easter-egg') {
      scale.set(size, size, size);
    } else {
      scale.set(
        size * randomBetween(0.72, 1.32),
        size * randomBetween(0.72, 1.22),
        size * randomBetween(0.72, 1.32),
      );
    }
    matrix.compose(position, quaternion, scale);
    bodies.setMatrixAt(index, matrix);
    applyThemeInstanceColor(bodies, style, index);

    if (stems) {
      localStemScale.makeScale(
        1 / Math.max(scale.x, 0.001),
        1 / Math.max(scale.y, 0.001),
        1 / Math.max(scale.z, 0.001),
      );
      stemMatrix.copy(matrix).multiply(localStemScale).scale(scale);
      stems.setMatrixAt(index, stemMatrix);
    }
  }
  bodies.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (stems) stems.instanceMatrix.needsUpdate = true;

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
  const dustColor =
    style === 'snowball'
      ? 0xeaf5ff
      : style === 'pumpkin'
        ? 0xf2a04e
        : style === 'easter-egg'
          ? 0xf2c7e5
          : 0xaaa094;
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      color: dustColor,
      size: style === 'snowball' || style === 'easter-egg' ? 0.055 : 0.065,
      transparent: true,
      opacity: style === 'rock' ? 0.42 : 0.28,
      sizeAttenuation: true,
      depthWrite: false,
    }),
  );
  dust.userData.kidsGalaxyAsteroidBeltDust = true;

  group.add(bodies);
  if (stems) group.add(stems);
  group.add(dust);
  return group;
}

function themedFlyby() {
  const theme = normalizeTheme(this.settings?.theme);
  const style = asteroidStyleForTheme(theme);
  const direction = randomDirection();
  const start = direction.clone().multiplyScalar(randomBetween(29, 34));
  const end = direction.clone().multiplyScalar(-randomBetween(29, 34));
  const offset = randomDirection().multiplyScalar(randomBetween(7, 13));
  start.add(offset);
  end.add(offset);

  const group = new THREE.Group();
  group.userData.kidsGalaxyAsteroidFlyby = true;
  group.userData.kidsGalaxyTheme = theme;
  group.userData.kidsGalaxyAsteroidStyle = style;

  const count = 8 + Math.floor(Math.random() * 5);
  const radius = 0.26;
  const bodies = new THREE.InstancedMesh(
    createAsteroidGeometry(theme, radius),
    createAsteroidMaterial(theme),
    count,
  );
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  bodies.userData.kidsGalaxyAsteroidFlybyRocks = true;
  bodies.userData.kidsGalaxyThemedAsteroids = true;
  bodies.userData.kidsGalaxyAsteroidStyle = style;
  if (style === 'easter-egg') bodies.userData.kidsGalaxyPastelEggs = true;

  const stems = style === 'pumpkin'
    ? new THREE.InstancedMesh(
        createPumpkinStemGeometry(radius),
        createPumpkinStemMaterial(),
        count,
      )
    : null;
  if (stems) {
    stems.castShadow = true;
    stems.receiveShadow = true;
    stems.userData.kidsGalaxyPumpkinStems = true;
  }

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let index = 0; index < count; index += 1) {
    position.set(
      randomBetween(-1.8, 1.8),
      randomBetween(-1.1, 1.1),
      randomBetween(-1.5, 1.5),
    );
    euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    quaternion.setFromEuler(euler);
    const size = randomBetween(0.55, 1.4);
    if (style === 'easter-egg') {
      scale.setScalar(size);
    } else {
      scale.set(size, size * randomBetween(0.8, 1.18), size * randomBetween(0.8, 1.18));
    }
    matrix.compose(position, quaternion, scale);
    bodies.setMatrixAt(index, matrix);
    applyThemeInstanceColor(bodies, style, index + 2);
    stems?.setMatrixAt(index, matrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (stems) stems.instanceMatrix.needsUpdate = true;
  group.add(bodies);
  if (stems) group.add(stems);
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

/** Install holiday substitutions for asteroid belts and intermittent fly-bys. */
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
