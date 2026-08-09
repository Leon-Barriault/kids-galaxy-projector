import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { applyPiRenderBudget } from './ProjectorQuality.js';

/** Owns projector camera, user controls, and viewport resize handling. */
export class CameraController {
  constructor(renderer) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 11, 26);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 40;
    this.controls.target.set(0, 0, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.2;

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  update() {
    this.controls.update();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    applyPiRenderBudget(
      this.renderer,
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio,
    );
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
  }
}
