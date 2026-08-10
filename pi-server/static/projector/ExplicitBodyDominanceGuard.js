import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const SIZE = 256;
const SENTINEL_MIN_SHARE = 0.50;
const SENTINEL_LEAD = 1.08;
const MIN_SCALE = 0.90;
const SCALE_STEP = 0.02;
const PALETTE = [
  [0xe5, 0x39, 0x35],
  [0xff, 0x98, 0x00],
  [0xff, 0xeb, 0x3b],
  [0x4c, 0xaf, 0x50],
  [0x21, 0x96, 0xf3],
  [0x9c, 0x27, 0xb0],
  [0xe9, 0x1e, 0x63],
  [0x00, 0x00, 0x00],
];

function parseHex(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return null;
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function distanceSquared(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function nearestPalette(rgb) {
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  PALETTE.forEach((candidate, index) => {
    const distance = distanceSquared(rgb, candidate);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  return nearest;
}

function paletteIndexFor(hex) {
  const rgb = parseHex(hex);
  return rgb ? nearestPalette(rgb) : -1;
}

function measure(canvas, sentinelIndex) {
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, SIZE, SIZE).data;
  const counts = new Array(PALETTE.length).fill(0);
  let inside = 0;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const nx = ((x + 0.5) / SIZE - 0.5) * 2;
      const ny = ((y + 0.5) / SIZE - 0.5) * 2;
      if (nx * nx + ny * ny > 0.965 * 0.965) continue;
      const offset = (y * SIZE + x) * 4;
      counts[nearestPalette([pixels[offset], pixels[offset + 1], pixels[offset + 2]])] += 1;
      inside += 1;
    }
  }

  const sentinel = counts[sentinelIndex] || 0;
  const largestChild = Math.max(
    0,
    ...counts.filter((_count, index) => index !== sentinelIndex),
  );
  return {
    sentinel,
    largestChild,
    share: sentinel / Math.max(1, inside),
  };
}

function isSafe(measurement) {
  return Boolean(
    measurement &&
      measurement.share >= SENTINEL_MIN_SHARE &&
      measurement.sentinel >= measurement.largestChild * SENTINEL_LEAD,
  );
}

function isolateAuthored(canvas, sentinelIndex) {
  const sourceContext = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!sourceContext) return null;
  const source = sourceContext.getImageData(0, 0, SIZE, SIZE).data;
  const authored = document.createElement('canvas');
  authored.width = SIZE;
  authored.height = SIZE;
  const context = authored.getContext('2d', { alpha: true });
  if (!context) return null;
  const image = context.createImageData(SIZE, SIZE);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const offset = (y * SIZE + x) * 4;
      const palette = nearestPalette([source[offset], source[offset + 1], source[offset + 2]]);
      if (palette === sentinelIndex) continue;
      image.data[offset] = source[offset];
      image.data[offset + 1] = source[offset + 1];
      image.data[offset + 2] = source[offset + 2];
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return authored;
}

function guardedTexture(texture) {
  if (!texture?.userData?.kidsGalaxyExplicitBodyAnalysis || !texture.image) return null;
  const sentinelHex = texture.userData.kidsGalaxyExplicitBodySentinel;
  const sentinelRgb = parseHex(sentinelHex);
  const sentinelIndex = Number.isInteger(texture.userData.kidsGalaxyExplicitBodySentinelIndex)
    ? texture.userData.kidsGalaxyExplicitBodySentinelIndex
    : paletteIndexFor(sentinelHex);
  if (!sentinelRgb || sentinelIndex < 0) return null;

  const initial = measure(texture.image, sentinelIndex);
  if (isSafe(initial)) {
    texture.userData.kidsGalaxyExplicitBodyDominanceScale = 1;
    return null;
  }

  const authored = isolateAuthored(texture.image, sentinelIndex);
  if (!authored) return null;

  for (let scale = 0.98; scale >= MIN_SCALE - 0.001; scale -= SCALE_STEP) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) continue;
    context.fillStyle = `rgb(${sentinelRgb[0]}, ${sentinelRgb[1]}, ${sentinelRgb[2]})`;
    context.fillRect(0, 0, SIZE, SIZE);
    const extent = SIZE * scale;
    const inset = (SIZE - extent) / 2;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(authored, inset, inset, extent, extent);

    const measurement = measure(canvas, sentinelIndex);
    if (!isSafe(measurement) && scale > MIN_SCALE + 0.001) continue;

    const result = new THREE.CanvasTexture(canvas);
    result.userData = { ...texture.userData };
    result.userData.kidsGalaxyExplicitBodyDominanceScale = Number(scale.toFixed(2));
    result.userData.kidsGalaxyExplicitBodySentinelShare = measurement?.share || 0;
    result.needsUpdate = true;
    return result;
  }
  return null;
}

/** Ensure the analysis-only background wins the temporary dominant-colour vote. */
export function installExplicitBodyDominanceGuard() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyExplicitBodyDominanceGuard) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function explicitBodyDominanceGuardTexture(texture) {
    const guarded = guardedTexture(texture);
    if (!guarded) {
      previousApplyTexture.call(this, texture);
      return;
    }
    try {
      previousApplyTexture.call(this, guarded);
    } finally {
      guarded.dispose();
    }
  }

  explicitBodyDominanceGuardTexture.kidsGalaxyExplicitBodyDominanceGuard = true;
  PlanetEntity.prototype.applyTexture = explicitBodyDominanceGuardTexture;
}
