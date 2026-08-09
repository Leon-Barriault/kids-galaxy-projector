import * as THREE from 'three';

const DEFAULT_MU = 40;

/** Orbit math and entry animation, independent from loading and scene ownership. */
export class PlanetAnimator {
  constructor(mu = DEFAULT_MU) {
    this.mu = mu;
    this.scratch = new THREE.Vector3();
  }

  meanMotion(a) {
    return Math.sqrt(this.mu / (a * a * a));
  }

  solveKepler(M, e) {
    let E = M;
    for (let k = 0; k < 8; k++) {
      E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    return E;
  }

  positionOnOrbit(params, t) {
    const M = params.M0 + params.n * t;
    const E = this.solveKepler(M, params.e);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);

    // Standard eccentric-anomaly parameterisation. The previous implementation
    // multiplied these coordinates by the instantaneous orbital radius again,
    // which distorted both the path and its guide into an uneven/egg-like loop.
    const xOrb = params.a * (cosE - params.e);
    const yOrb = params.a * Math.sqrt(1 - params.e * params.e) * sinE;
    return this.scratch.set(
      xOrb,
      yOrb * Math.sin(params.i),
      yOrb * Math.cos(params.i),
    );
  }

  /** FNV-1a. Small, dependency-free, and stable across reloads. */
  hashId(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Derive an orbit from stable planet identity, never from arrival order. */
  orbitParamsFor(id, gallerySize) {
    const h = this.hashId(id);
    const slot = h % gallerySize;
    const a = 6.5 + slot * 0.75;
    const e = 0.04 + ((h >>> 4) % 3) * 0.03;
    const i = (((h >>> 8) % 5) - 2) * 0.08;
    return {
      a,
      e,
      i,
      n: this.meanMotion(a),
      M0: ((h >>> 12) % 628) / 100,
      spin: 0.4 + ((h >>> 20) % 30) / 100,
    };
  }

  scaleIn(mesh) {
    const start = performance.now();
    const duration = 1000;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const eased = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
      mesh.scale.setScalar(Math.max(0.01, eased));
      if (t < 1) requestAnimationFrame(tick);
      else mesh.scale.setScalar(1);
    };

    requestAnimationFrame(tick);
  }
}
