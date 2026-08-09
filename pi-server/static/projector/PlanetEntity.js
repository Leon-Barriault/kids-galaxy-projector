import * as THREE from 'three';

const VALID_STYLES = new Set(['classic', 'ringed', 'cratered', 'spiky']);
const VALID_COMPANIONS = new Set(['moon', 'stars', 'satellite', 'astronaut']);

/** A single kid-created planet and the Three.js resources it owns. */
export class PlanetEntity {
  constructor({ payload, order, gallerySize, scene, animator, celebrate }) {
    this.id = payload.id;
    this.order = order;
    this.timestamp = Number(payload.timestamp) || 0;
    this.scene = scene;
    this.animator = animator;
    this.disposed = false;
    this.style = VALID_STYLES.has(payload.style) ? payload.style : 'classic';
    this.companionTypes = Array.isArray(payload.companions)
      ? payload.companions.filter((value) => VALID_COMPANIONS.has(value))
      : [];
    this.decorations = [];
    this.companions = [];

    Object.assign(this, animator.orbitParamsFor(payload.id, gallerySize));

    this.mesh = new THREE.Mesh(
      this.createPlanetGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0x9fb4d8,
        roughness: 0.45,
        metalness: 0.08,
        emissive: 0x223355,
        emissiveIntensity: 0.35,
      }),
    );
    this.mesh.scale.setScalar(celebrate ? 0.01 : 1);
    scene.add(this.mesh);

    if (this.style === 'ringed') this.addPlanetRing();
    this.addSelectedCompanions();

    this.ring = scene.createOrbitRing(this.a, this.e, this.i);
    scene.add(this.ring);

    if (celebrate) animator.scaleIn(this.mesh);
  }

  createPlanetGeometry() {
    const geometry = new THREE.SphereGeometry(1.05, 64, 48);
    if (this.style === 'cratered') this.applyCraterShape(geometry);
    if (this.style === 'spiky') this.applyMountainSpikes(geometry);
    return geometry;
  }

  applyCraterShape(geometry) {
    const directions = [
      new THREE.Vector3(0.8, 0.25, 0.5).normalize(),
      new THREE.Vector3(-0.45, 0.75, 0.35).normalize(),
      new THREE.Vector3(0.2, -0.55, 0.82).normalize(),
      new THREE.Vector3(-0.8, -0.2, -0.45).normalize(),
      new THREE.Vector3(0.55, 0.65, -0.5).normalize(),
    ];
    const position = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      normal.copy(vertex).normalize();
      let depression = 0;
      directions.forEach((direction, craterIndex) => {
        const edge = 0.93 + craterIndex * 0.004;
        const dot = normal.dot(direction);
        if (dot > edge) {
          const x = (dot - edge) / (1 - edge);
          depression = Math.max(depression, Math.sin(x * Math.PI) * (0.07 + craterIndex * 0.008));
        }
      });
      vertex.multiplyScalar(1 - depression);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  applyMountainSpikes(geometry) {
    const phase = (this.animator.seedFromId(this.id) % 628) / 100;
    const baseDirections = [
      [0.8, 0.2, 0.55, 0.34],
      [-0.7, 0.45, 0.5, 0.24],
      [0.2, 0.9, -0.35, 0.42],
      [-0.2, -0.85, 0.48, 0.3],
      [0.65, -0.48, -0.58, 0.2],
      [-0.75, -0.2, -0.62, 0.37],
      [0.15, 0.42, 0.9, 0.27],
      [0.48, 0.62, -0.64, 0.32],
    ];
    const rotation = new THREE.Matrix4().makeRotationY(phase);
    const peaks = baseDirections.map(([x, y, z, height]) => ({
      direction: new THREE.Vector3(x, y, z).normalize().applyMatrix4(rotation).normalize(),
      height,
    }));
    const position = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      normal.copy(vertex).normalize();
      let extra = 0;
      peaks.forEach(({ direction, height }) => {
        const dot = normal.dot(direction);
        if (dot > 0.88) {
          const x = (dot - 0.88) / 0.12;
          extra = Math.max(extra, Math.pow(x, 3.2) * height);
        }
      });
      vertex.multiplyScalar(1 + extra);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  addPlanetRing() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.7, 80),
      new THREE.MeshBasicMaterial({
        color: 0xd8a6ff,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2.4;
    ring.rotation.z = 0.22;
    this.scene.add(ring);
    this.decorations.push(ring);
  }

  addSelectedCompanions() {
    this.companionTypes.forEach((type, index) => {
      const object = this.createCompanion(type);
      if (!object) return;
      const seed = this.animator.seedFromId(`${this.id}-${type}`);
      const record = {
        type,
        object,
        orbitRadius: 1.65 + index * 0.32 + (seed % 20) / 100,
        speed: 0.32 + ((seed >> 3) % 25) / 100,
        phase: ((seed % 628) / 100) + index * 0.7,
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
          new THREE.MeshStandardMaterial({ color: 0xbfc5d1, roughness: 0.92, metalness: 0 }),
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
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xd6dbe3, roughness: 0.35, metalness: 0.65 });
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x2878d0, roughness: 0.45, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.28), bodyMaterial);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.2), panelMaterial.clone());
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.2), panelMaterial.clone());
    left.position.x = -0.29;
    right.position.x = 0.29;
    group.add(body, left, right);
    group.scale.setScalar(0.9);
    return group;
  }

  createAstronaut() {
    const group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0xf4f6ff, roughness: 0.5, metalness: 0.08 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x18304f, roughness: 0.18, metalness: 0.7 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), suit);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 14), visor);
    face.position.z = 0.075;
    head.position.y = 0.18;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.23, 0.12), suit.clone());
    const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), suit.clone());
    const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), suit.clone());
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

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.scene.renderer.capabilities.getMaxAnisotropy();
    const material = this.mesh.material;
    material.map = texture;
    material.emissive = new THREE.Color(0xffffff);
    material.emissiveMap = texture;
    material.emissiveIntensity = 0.55;
    material.color = new THREE.Color(0xffffff);
    material.needsUpdate = true;
  }

  disposeObject(object) {
    this.scene.remove(object);
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeObject(this.mesh);
    this.decorations.forEach((object) => this.disposeObject(object));
    this.companions.forEach(({ object }) => this.disposeObject(object));
    this.scene.remove(this.ring);
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
