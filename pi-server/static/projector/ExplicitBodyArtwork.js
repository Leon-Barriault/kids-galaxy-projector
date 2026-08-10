import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const WORK_SIZE = 256;
const TARGET_FILL = 0.84;
const BODY_MATCH_DISTANCE = 46;

// Keep this list aligned with the legacy sculptor's colour buckets. The
// explicit-body preprocessor chooses one bucket the child did not use and uses
// it only as an internal analysis background. That guarantees a broad painted
// stroke can never accidentally become the inferred planet body.
const ANALYSIS_PALETTE = [
  [0xe5, 0x39, 0x35],
  [0xff, 0x98, 0x00],
  [0xff, 0xeb, 0x3b],
  [0x4c, 0xaf, 0x50],
  [0x21, 0x96, 0xf3],
  [0x9c, 0x27, 0xb0],
  [0xe9, 0x1e, 0x63],
  [0x00, 0x00, 0x00],
];

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function imageSize(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 0,
  };
}

function parseHex(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return null;
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function nearestPaletteIndex(rgb) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  ANALYSIS_PALETTE.forEach((candidate, index) => {
    const distance = rgbDistance(rgb, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function captureSource(texture) {
  if (typeof document === 'undefined' || !texture?.image) return null;
  const size = imageSize(texture.image);
  if (!size.width || !size.height) return null;

  const canvas = makeCanvas(WORK_SIZE, WORK_SIZE);
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) return null;
  context.clearRect(0, 0, WORK_SIZE, WORK_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(texture.image, 0, 0, WORK_SIZE, WORK_SIZE);
  return canvas;
}

function analyseAuthoredPixels(source, bodyRgb) {
  const context = source.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) return null;
  const image = context.getImageData(0, 0, WORK_SIZE, WORK_SIZE);
  const pixels = image.data;
  const authored = new Uint8ClampedArray(pixels.length);
  const usedCounts = new Array(ANALYSIS_PALETTE.length).fill(0);

  let minX = WORK_SIZE;
  let minY = WORK_SIZE;
  let maxX = -1;
  let maxY = -1;
  let authoredCount = 0;

  for (let y = 0; y < WORK_SIZE; y += 1) {
    for (let x = 0; x < WORK_SIZE; x += 1) {
      const offset = (y * WORK_SIZE + x) * 4;
      const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      if (rgbDistance(rgb, bodyRgb) <= BODY_MATCH_DISTANCE) continue;

      // The Android export keeps the square outside the planet disc white.
      // When the selected body is not white that square is transport padding,
      // not authored white paint. Ignore it outside the circular tablet guide.
      const nx = ((x + 0.5) / WORK_SIZE - 0.5) * 2;
      const ny = ((y + 0.5) / WORK_SIZE - 0.5) * 2;
      if (nx * nx + ny * ny > 0.965 * 0.965) continue;

      const paletteIndex = nearestPaletteIndex(rgb);
      // Anti-aliased pixels from a same-colour stroke are intentionally
      // absorbed into the explicit body as well.
      if (rgbDistance(ANALYSIS_PALETTE[paletteIndex], bodyRgb) <= BODY_MATCH_DISTANCE) {
        continue;
      }

      authored[offset] = pixels[offset];
      authored[offset + 1] = pixels[offset + 1];
      authored[offset + 2] = pixels[offset + 2];
      authored[offset + 3] = 255;
      usedCounts[paletteIndex] += 1;
      authoredCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    authored,
    authoredCount,
    usedCounts,
    bounds:
      authoredCount > 0
        ? {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
          }
        : null,
  };
}

function chooseSentinel(usedCounts) {
  let candidate = -1;
  for (let index = 0; index < usedCounts.length; index += 1) {
    if (usedCounts[index] === 0) return ANALYSIS_PALETTE[index];
    if (candidate < 0 || usedCounts[index] < usedCounts[candidate]) candidate = index;
  }
  return ANALYSIS_PALETTE[Math.max(0, candidate)];
}

function preparedTexture(texture, bodyHex) {
  const bodyRgb = parseHex(bodyHex);
  const source = captureSource(texture);
  if (!bodyRgb || !source) return null;

  const analysis = analyseAuthoredPixels(source, bodyRgb);
  if (!analysis) return null;

  const sentinel = chooseSentinel(analysis.usedCounts);
  const output = makeCanvas(WORK_SIZE, WORK_SIZE);
  const outputContext = output.getContext('2d', { alpha: false });
  if (!outputContext) return null;
  outputContext.fillStyle = `rgb(${sentinel[0]}, ${sentinel[1]}, ${sentinel[2]})`;
  outputContext.fillRect(0, 0, WORK_SIZE, WORK_SIZE);

  if (analysis.bounds) {
    const authoredCanvas = makeCanvas(WORK_SIZE, WORK_SIZE);
    const authoredContext = authoredCanvas.getContext('2d', { alpha: true });
    if (authoredContext) {
      const image = authoredContext.createImageData(WORK_SIZE, WORK_SIZE);
      image.data.set(analysis.authored);
      authoredContext.putImageData(image, 0, 0);

      // Fill X and Y independently so the child's full composition once again
      // becomes the planet-wide design instead of a small central smudge.
      const targetPixels = WORK_SIZE * TARGET_FILL;
      const targetX = (WORK_SIZE - targetPixels) / 2;
      const targetY = (WORK_SIZE - targetPixels) / 2;
      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = 'high';
      outputContext.drawImage(
        authoredCanvas,
        analysis.bounds.minX,
        analysis.bounds.minY,
        analysis.bounds.width,
        analysis.bounds.height,
        targetX,
        targetY,
        targetPixels,
        targetPixels,
      );
    }
  }

  const result = new THREE.CanvasTexture(output);
  result.needsUpdate = true;
  result.userData.kidsGalaxyExplicitBodyAnalysis = true;
  result.userData.kidsGalaxyExplicitBodySentinel = `#${sentinel
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
  result.userData.kidsGalaxyExplicitBodyTargetFill = TARGET_FILL;
  result.userData.kidsGalaxyExplicitBodyAuthoredCells = analysis.authoredCount;
  return result;
}

function markExplicitArtwork(entity, analysisTexture) {
  const group = entity.sculptedArtworkGroup;
  if (group) {
    group.userData.kidsGalaxyExplicitBodyArtwork = true;
    group.userData.kidsGalaxyBodyColor = entity.bodyColor;
    group.userData.kidsGalaxyArtworkTargetFill = TARGET_FILL;
    group.userData.kidsGalaxyAuthoredCellCount =
      analysisTexture.userData.kidsGalaxyExplicitBodyAuthoredCells || 0;
    group.children.forEach((child) => {
      if (!child.isMesh || !child.userData?.kidsGalaxySculptedKidPatch) return;
      child.userData.kidsGalaxyExplicitBodyPatch = true;
      if (child.geometry) child.geometry.userData.kidsGalaxyExplicitBodyPatch = true;
    });
  }

  const data = entity.mesh.material.userData;
  data.kidsGalaxyTrueSculptedArtwork = true;
  data.kidsGalaxyExplicitBodyArtwork = true;
  data.kidsGalaxyExplicitBodyPatchCount =
    group?.children.filter(
      (child) => child.userData?.kidsGalaxyExplicitBodyPatch &&
        !child.userData?.kidsGalaxyBackDesignEcho,
    ).length || 0;
  data.kidsGalaxyTraitsStretchedToPlanet = true;
  data.kidsGalaxyArtworkTargetFill = TARGET_FILL;
  data.kidsGalaxyExplicitBodySentinel =
    analysisTexture.userData.kidsGalaxyExplicitBodySentinel;
  data.designProjection = 'explicit-body-preserved-kid-traits-across-planet';
}

/**
 * New-tablet path: remove the explicit bucket colour from artwork analysis,
 * stretch the remaining child traits across the planet, and then let the
 * existing rounded-slab sculptor do the actual geometry work.
 */
export function installExplicitBodyArtwork() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyExplicitBodyArtwork) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function explicitBodyArtworkTexture(texture) {
    if (!this.bodyColor) {
      previousApplyTexture.call(this, texture);
      return;
    }

    const prepared = preparedTexture(texture, this.bodyColor);
    if (!prepared) {
      previousApplyTexture.call(this, texture);
      return;
    }

    try {
      previousApplyTexture.call(this, prepared);
      markExplicitArtwork(this, prepared);
    } finally {
      prepared.dispose();
    }
  }

  explicitBodyArtworkTexture.kidsGalaxyExplicitBodyArtwork = true;
  PlanetEntity.prototype.applyTexture = explicitBodyArtworkTexture;
}
