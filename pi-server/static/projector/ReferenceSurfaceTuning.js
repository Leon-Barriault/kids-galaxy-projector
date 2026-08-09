import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const MASK_WIDTH = 256;
const MASK_HEIGHT = 128;
const TARGET_MAX_COVERAGE = 0.285;
const TARGET_EDGE_RADIUS = 1.066;
const TARGET_TOP_RADIUS = 1.084;

function thresholdMask(canvas) {
  const sample = document.createElement('canvas');
  sample.width = MASK_WIDTH;
  sample.height = MASK_HEIGHT;
  const context = sample.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.drawImage(canvas, 0, 0, MASK_WIDTH, MASK_HEIGHT);
  const pixels = context.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT).data;
  const mask = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  for (let index = 0; index < mask.length; index += 1) {
    if (pixels[index * 4] >= 92) mask[index] = 1;
  }
  return mask;
}

function coverage(mask) {
  let count = 0;
  mask.forEach((value) => {
    count += value;
  });
  return count / Math.max(1, mask.length);
}

function erode(mask) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < MASK_HEIGHT; y += 1) {
    for (let x = 0; x < MASK_WIDTH; x += 1) {
      let keep = 1;
      for (let dy = -1; dy <= 1 && keep; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= MASK_HEIGHT) {
          keep = 0;
          break;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = (x + dx + MASK_WIDTH) % MASK_WIDTH;
          if (!mask[ny * MASK_WIDTH + nx]) {
            keep = 0;
            break;
          }
        }
      }
      output[y * MASK_WIDTH + x] = keep;
    }
  }
  return output;
}

function keepMeaningfulComponents(mask) {
  const visited = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  const neighbours = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  for (let y = 0; y < MASK_HEIGHT; y += 1) {
    for (let x = 0; x < MASK_WIDTH; x += 1) {
      const start = y * MASK_WIDTH + x;
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      const component = [];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        component.push(current);
        const cy = Math.floor(current / MASK_WIDTH);
        const cx = current % MASK_WIDTH;
        neighbours.forEach(([dx, dy]) => {
          const ny = cy + dy;
          if (ny < 0 || ny >= MASK_HEIGHT) return;
          const nx = (cx + dx + MASK_WIDTH) % MASK_WIDTH;
          const next = ny * MASK_WIDTH + nx;
          if (!mask[next] || visited[next]) return;
          visited[next] = 1;
          queue.push(next);
        });
      }
      if (component.length < 12) continue;
      component.forEach((index) => {
        output[index] = 1;
      });
    }
  }
  return output;
}

function maskCanvas(mask, blurPixels = 1.15) {
  const small = document.createElement('canvas');
  small.width = MASK_WIDTH;
  small.height = MASK_HEIGHT;
  const context = small.getContext('2d', { alpha: false });
  if (!context) return small;
  const image = context.createImageData(MASK_WIDTH, MASK_HEIGHT);
  mask.forEach((value, index) => {
    const pixel = index * 4;
    const level = value ? 255 : 0;
    image.data[pixel] = level;
    image.data[pixel + 1] = level;
    image.data[pixel + 2] = level;
    image.data[pixel + 3] = 255;
  });
  context.putImageData(image, 0, 0);

  const output = document.createElement('canvas');
  output.width = 512;
  output.height = 256;
  const outputContext = output.getContext('2d', { alpha: false });
  if (!outputContext) return small;
  outputContext.fillStyle = '#000';
  outputContext.fillRect(0, 0, output.width, output.height);
  outputContext.imageSmoothingEnabled = true;
  if ('filter' in outputContext) outputContext.filter = `blur(${blurPixels}px)`;
  outputContext.drawImage(small, 0, 0, output.width, output.height);
  if ('filter' in outputContext) outputContext.filter = 'none';
  return output;
}

function textureFromMask(canvas, renderer) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
  texture.offset.x = 0.25;
  texture.needsUpdate = true;
  return texture;
}

function tuneArtwork(entity) {
  const top = entity.accentMesh?.material;
  const edge = entity.accentEdgeMesh?.material;
  const sourceMask = top?.alphaMap?.image;
  if (!sourceMask?.width || !sourceMask?.height) return;

  let mask = thresholdMask(sourceMask);
  if (!mask) return;
  mask = keepMeaningfulComponents(mask);

  let passes = 0;
  while (coverage(mask) > TARGET_MAX_COVERAGE && passes < 8) {
    const next = erode(mask);
    if (coverage(next) < 0.055) break;
    mask = next;
    passes += 1;
  }

  const topCanvas = maskCanvas(mask, 1.05);
  const reliefCanvas = maskCanvas(mask, 3.0);
  const topMask = textureFromMask(topCanvas, entity.scene.renderer);
  const relief = textureFromMask(reliefCanvas, entity.scene.renderer);

  const oldTextures = new Set([
    top.alphaMap,
    top.bumpMap,
    top.displacementMap,
    edge.alphaMap,
    edge.bumpMap,
  ]);
  top.alphaMap = topMask;
  top.bumpMap = relief;
  top.displacementMap = relief;
  edge.alphaMap = topMask;
  edge.bumpMap = relief;
  oldTextures.forEach((texture) => {
    if (texture && texture !== topMask && texture !== relief) texture.dispose();
  });

  const edgeRadius = entity.accentEdgeMesh.geometry?.parameters?.radius || 1.078;
  const topRadius = entity.accentMesh.geometry?.parameters?.radius || 1.112;
  entity.accentEdgeMesh.scale.setScalar(TARGET_EDGE_RADIUS / edgeRadius);
  entity.accentMesh.scale.setScalar(TARGET_TOP_RADIUS / topRadius);

  entity.mesh.material.roughness = 0.57;
  entity.mesh.material.clearcoat = 0.035;
  entity.mesh.material.clearcoatRoughness = 0.72;

  edge.roughness = 0.56;
  edge.clearcoat = 0.035;
  edge.clearcoatRoughness = 0.72;
  edge.bumpScale = 0.018;
  edge.alphaTest = 0.22;

  top.roughness = 0.49;
  top.clearcoat = 0.06;
  top.clearcoatRoughness = 0.68;
  top.bumpScale = 0.036;
  top.displacementScale = 0.012;
  top.displacementBias = -0.001;
  top.alphaTest = 0.28;

  entity.mesh.material.userData.accentCoverage = coverage(mask);
  entity.mesh.material.userData.kidsGalaxyReferenceProportionTuning = true;
  entity.mesh.material.userData.kidsGalaxyTargetAccentCoverage = TARGET_MAX_COVERAGE;
  entity.mesh.material.userData.kidsGalaxyAccentErosionPasses = passes;
  top.userData.kidsGalaxyReferenceReliefHeight = TARGET_TOP_RADIUS - 1.05;
  edge.userData.kidsGalaxyReferenceShoulderHeight = TARGET_EDGE_RADIUS - 1.05;
  top.needsUpdate = true;
  edge.needsUpdate = true;
}

/**
 * Final visual-proportion pass. The kid drawing still supplies body colour,
 * colours and silhouettes; this pass only constrains relief to the rounded,
 * low-profile molded forms visible in the supplied toy/clay references.
 */
export function installReferenceSurfaceTuning() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyReferenceSurfaceTuning) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function referenceSurfaceTexture(texture) {
    previousApplyTexture.call(this, texture);
    if (!this.mesh.material.userData?.kidsGalaxyKidDesignProjection) return;
    tuneArtwork(this);
  }

  referenceSurfaceTexture.kidsGalaxyReferenceSurfaceTuning = true;
  PlanetEntity.prototype.applyTexture = referenceSurfaceTexture;
}
