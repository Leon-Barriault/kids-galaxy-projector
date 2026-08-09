import * as THREE from 'three';

const BELT_ROCK_COUNT = 260;
const BELT_DUST_COUNT = 520;
const COMET_TAIL_LENGTH = 4.2;
const FREQUENCY_SECONDS = {
  comet: {
    rare: [70, 110],
    normal: [38, 62],
    frequent: [18, 30],
  },
  flyby: {
    rare: [55, 85],
    normal: [30, 48],
    frequent: [14, 26],
  },
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function frequencyRange(kind, frequency) {
  return FREQUENCY_SECONDS[kind][frequency] || FREQUENCY_SECONDS[kind].normal;
}

function disposeObject(scene, object) {
  scene.remove(object);
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}

function randomDirection() {
  const angle = Math.random() * Math.PI * 2;
  const vertical = randomBetween(-0.34, 0.34);
  return new THREE.Vector3(Math.cos(angle), vertical, Math.sin(angle)).normalize();
}

/** Persistent and intermittent space activity configured by the manager. */
export class GalaxyEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.asteroidBelt = null;
    this.comets = [];
    this.flybys = [];
    this.lastTime = 0;
    this.nextCometAt = Infinity;
    this.nextFlybyAt = Infinity;
    this.settings = {
      asteroidBeltEnabled: false,
      cometsEnabled: false,
      cometFrequency: 'normal',
      flybyAsteroidsEnabled: false,
      flybyFrequency: 'normal',
    };
  }

  applyBehavior(behavior) {
    const next = {
      asteroidBeltEnabled: behavior?.asteroid_belt_enabled === true,
      cometsEnabled: behavior?.comets_enabled === true,
      cometFrequency: behavior?.comet_frequency || 'normal',
      flybyAsteroidsEnabled: behavior?.flyby_asteroids_enabled === true,
      flybyFrequency: behavior?.flyby_frequency || 'normal',
    };

    if (next.asteroidBeltEnabled && !this.asteroidBelt) {
      this.asteroidBelt = this.createAsteroidBelt();
      this.scene.add(this.asteroidBelt);
    } else if (!next.asteroidBeltEnabled && this.asteroidBelt) {
      disposeObject(this.scene, this.asteroidBelt);
      this.asteroidBelt = null;
    }

    const cometChanged =
      next.cometsEnabled !== this.settings.cometsEnabled ||
      next.cometFrequency !== this.settings.cometFrequency;
    const flybyChanged =
      next.flybyAsteroidsEnabled !== this.settings.flybyAsteroidsEnabled ||
      next.flybyFrequency !== this.settings.flybyFrequency;

    if (!next.cometsEnabled) this.clearComets();
    if (!next.flybyAsteroidsEnabled) this.clearFlybys();

    this.settings = next;
    if (cometChanged) {
      this.nextCometAt = next.cometsEnabled ? this.lastTime + randomBetween(6, 12) : Infinity;
    }
    if (flybyChanged) {
      this.nextFlybyAt = next.flybyAsteroidsEnabled
        ? this.lastTime + randomBetween(8, 16)
        : Infinity;
    }
  }

  createAsteroidBelt() {
    const group = new THREE.Group();
    group.userData.kidsGalaxyAsteroidBelt = true;
    group.rotation.x = 0.08;
    group.rotation.z = -0.04;

    const geometry = new THREE.DodecahedronGeometry(0.16, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.03,
    });
    const rocks = new THREE.InstancedMesh(geometry, material, BELT_ROCK_COUNT);
    rocks.userData.kidsGalaxyAsteroidBeltRocks = true;
    rocks.userData.rockCount = BELT_ROCK_COUNT;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const palette = [0x6f655d, 0x91867a, 0x514c49, 0xa29583, 0x736d69];

    for (let index = 0; index < BELT_ROCK_COUNT; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(17.5, 23.5);
      position.set(
        Math.cos(angle) * radius,
        randomBetween(-0.7, 0.7),
        Math.sin(angle) * radius,
      );
      euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      quaternion.setFromEuler(euler);
      const size = randomBetween(0.55, 1.8);
      scale.set(
        size * randomBetween(0.65, 1.4),
        size * randomBetween(0.55, 1.25),
        size * randomBetween(0.6, 1.35),
      );
      matrix.compose(position, quaternion, scale);
      rocks.setMatrixAt(index, matrix);
      rocks.setColorAt(index, new THREE.Color(palette[index % palette.length]));
    }
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;

    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(BELT_DUST_COUNT * 3);
    for (let index = 0; index < BELT_DUST_COUNT; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = randomBetween(17.2, 23.8);
      dustPositions[index * 3] = Math.cos(angle) * radius;
      dustPositions[index * 3 + 1] = randomBetween(-0.85, 0.85);
      dustPositions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: 0xaaa094,
        size: 0.075,
        transparent: true,
        opacity: 0.52,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    );
    dust.userData.kidsGalaxyAsteroidBeltDust = true;
    group.add(rocks, dust);
    return group;
  }

  spawnComet() {
    const startDirection = randomDirection();
    const start = startDirection.clone().multiplyScalar(randomBetween(31, 36));
    const end = startDirection.clone().multiplyScalar(-randomBetween(31, 36));
    const miss = randomDirection().multiplyScalar(randomBetween(4.5, 8));
    start.add(miss);
    end.add(miss.clone().multiplyScalar(0.45));

    const group = new THREE.Group();
    group.userData.kidsGalaxyComet = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xe8fbff }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 14, 10),
      new THREE.MeshBasicMaterial({
        color: 0x8fd8ff,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.52, COMET_TAIL_LENGTH, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x9bdfff,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    tail.userData.kidsGalaxyCometTailAntiSolar = true;
    tail.userData.tipFacesSun = true;
    group.add(head, halo, tail);
    this.scene.add(group);

    this.comets.push({
      group,
      head,
      halo,
      tail,
      start,
      end,
      bornAt: this.lastTime,
      lifetime: randomBetween(13, 18),
    });
  }

  updateComet(comet, t) {
    const progress = THREE.MathUtils.clamp((t - comet.bornAt) / comet.lifetime, 0, 1);
    const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
    const position = new THREE.Vector3().lerpVectors(comet.start, comet.end, eased);
    comet.head.position.copy(position);
    comet.halo.position.copy(position);

    // A comet tail is controlled by the solar wind, not by travel direction.
    // The narrow tip/head remains sunward even after periapsis while the tail
    // extends anti-solar, which is especially important as the comet goes away.
    const sunward = position.clone().normalize().multiplyScalar(-1);
    const antiSolar = sunward.clone().multiplyScalar(-1);
    comet.tail.position.copy(position).addScaledVector(antiSolar, COMET_TAIL_LENGTH * 0.5);
    comet.tail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunward);
    comet.tail.scale.x = 0.75 + Math.sin(t * 3.7) * 0.08;
    comet.tail.scale.z = comet.tail.scale.x;
    return progress >= 1;
  }

  spawnFlyby() {
    const direction = randomDirection();
    const start = direction.clone().multiplyScalar(randomBetween(29, 34));
    const end = direction.clone().multiplyScalar(-randomBetween(29, 34));
    const offset = randomDirection().multiplyScalar(randomBetween(7, 13));
    start.add(offset);
    end.add(offset);

    const group = new THREE.Group();
    group.userData.kidsGalaxyAsteroidFlyby = true;
    const count = 5 + Math.floor(Math.random() * 4);
    const geometry = new THREE.DodecahedronGeometry(0.28, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0x766d65,
      roughness: 0.92,
      metalness: 0.02,
    });
    const rocks = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();

    for (let index = 0; index < count; index += 1) {
      position.set(
        randomBetween(-1.6, 1.6),
        randomBetween(-0.9, 0.9),
        randomBetween(-1.3, 1.3),
      );
      euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      quaternion.setFromEuler(euler);
      const size = randomBetween(0.55, 1.35);
      scale.set(size, size * randomBetween(0.7, 1.2), size * randomBetween(0.65, 1.25));
      matrix.compose(position, quaternion, scale);
      rocks.setMatrixAt(index, matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.userData.kidsGalaxyAsteroidFlybyRocks = true;
    group.add(rocks);
    this.scene.add(group);

    this.flybys.push({
      group,
      start,
      end,
      bornAt: this.lastTime,
      lifetime: randomBetween(9, 13),
      spin: randomBetween(-0.012, 0.012),
    });
  }

  scheduleNext(kind, frequency, now) {
    const [minimum, maximum] = frequencyRange(kind, frequency);
    return now + randomBetween(minimum, maximum);
  }

  clearComets() {
    this.comets.forEach(({ group }) => disposeObject(this.scene, group));
    this.comets = [];
    this.nextCometAt = Infinity;
  }

  clearFlybys() {
    this.flybys.forEach(({ group }) => disposeObject(this.scene, group));
    this.flybys = [];
    this.nextFlybyAt = Infinity;
  }

  update(t) {
    this.lastTime = t;
    if (this.asteroidBelt) this.asteroidBelt.rotation.y += 0.00045;

    if (this.settings.cometsEnabled && t >= this.nextCometAt) {
      this.spawnComet();
      this.nextCometAt = this.scheduleNext('comet', this.settings.cometFrequency, t);
    }
    this.comets = this.comets.filter((comet) => {
      if (!this.updateComet(comet, t)) return true;
      disposeObject(this.scene, comet.group);
      return false;
    });

    if (this.settings.flybyAsteroidsEnabled && t >= this.nextFlybyAt) {
      this.spawnFlyby();
      this.nextFlybyAt = this.scheduleNext('flyby', this.settings.flybyFrequency, t);
    }
    this.flybys = this.flybys.filter((flyby) => {
      const progress = THREE.MathUtils.clamp((t - flyby.bornAt) / flyby.lifetime, 0, 1);
      flyby.group.position.lerpVectors(flyby.start, flyby.end, progress);
      flyby.group.rotation.x += flyby.spin;
      flyby.group.rotation.y += flyby.spin * 1.4;
      if (progress < 1) return true;
      disposeObject(this.scene, flyby.group);
      return false;
    });
  }
}
