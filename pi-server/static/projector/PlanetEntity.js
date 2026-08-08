import * as THREE from 'three';

/** A single kid-created planet and the Three.js resources it owns. */
export class PlanetEntity {
  constructor({ payload, order, gallerySize, scene, animator, celebrate }) {
    this.id = payload.id;
    this.order = order;
    this.timestamp = Number(payload.timestamp) || 0;
    this.scene = scene;
    this.animator = animator;
    this.disposed = false;

    Object.assign(this, animator.orbitParamsFor(payload.id, gallerySize));

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 48, 48),
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

    this.ring = scene.createOrbitRing(this.a, this.e, this.i);
    scene.add(this.ring);

    if (celebrate) animator.scaleIn(this.mesh);
  }

  update(t, behavior = {}) {
    const speed = Number(behavior.planet_speed) || 1;
    const animatedTime = t * speed;
    this.mesh.position.copy(this.animator.positionOnOrbit(this, animatedTime));
    this.mesh.rotation.y += this.spin * 0.01 * speed;

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

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.mesh);
    this.scene.remove(this.ring);
    this.mesh.geometry.dispose();
    if (this.mesh.material.map) this.mesh.material.map.dispose();
    this.mesh.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
