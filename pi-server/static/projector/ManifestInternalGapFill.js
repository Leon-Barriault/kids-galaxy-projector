import { PlanetEntity } from './PlanetEntity.js';

const RGB_HEX = /^#[0-9a-fA-F]{6}$/;
const VERTICAL_ASPECT_THRESHOLD = 1.55;
const WRAP_ASPECT_THRESHOLD = 0.72;
const BACKGROUND_DISTANCE_THRESHOLD = 18;
const BODY_HEIGHT = 26;
const RELIEF_BODY_TOLERANCE = 2;
const RELIEF_SAMPLE_DEPTH = 12;

function rgbOf(value) {
  const colour = typeof value === 'string' && RGB_HEX.test(value) ? value : '#000000';
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ];
}

function normalizedPoints(stroke) {
  if (!Array.isArray(stroke?.points)) return [];
  return stroke.points
    .filter(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
    .map(([x, y]) => [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]);
}

function projectedBand(stroke) {
  const points = normalizedPoints(stroke);
  if (points.length < 2) return null;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let sumY = 0;
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumY += y;
  });

  const spanX = Math.max(0.0001, maxX - minX);
  const spanY = Math.max(0.0001, maxY - minY);
  const verticalAspect = spanY / spanX;
  const horizontalAspect = spanX / spanY;
  const nearVertical = verticalAspect >= VERTICAL_ASPECT_THRESHOLD;
  const wrapsLongitude = !nearVertical && horizontalAspect >= WRAP_ASPECT_THRESHOLD;
  if (!wrapsLongitude) return null;

  const widthNormalized = Math.max(
    0.003,
    Math.min(0.35, Number(stroke.width_normalized) || Number(stroke.width_px) / 512 || 0.02),
  );
  const halfWidth = widthNormalized * 0.5;
  return {
    centerY: sumY / points.length,
    fromY: Math.max(0, minY - halfWidth),
    toY: Math.min(1, maxY + halfWidth),
  };
}

function backgroundDistanceSquared(data, offset, background) {
  const dr = data[offset] - background[0];
  const dg = data[offset + 1] - background[1];
  const db = data[offset + 2] - background[2];
  return dr * dr + dg * dg + db * db;
}

function isBackgroundPixel(data, offset, background) {
  return (
    backgroundDistanceSquared(data, offset, background) <=
    BACKGROUND_DISTANCE_THRESHOLD * BACKGROUND_DISTANCE_THRESHOLD
  );
}

function copyPixel(data, targetOffset, sourceOffset) {
  data[targetOffset] = data[sourceOffset];
  data[targetOffset + 1] = data[sourceOffset + 1];
  data[targetOffset + 2] = data[sourceOffset + 2];
}

function writeScalarPixel(data, offset, value) {
  const scalar = Math.max(0, Math.min(255, Math.round(value)));
  data[offset] = scalar;
  data[offset + 1] = scalar;
  data[offset + 2] = scalar;
  data[offset + 3] = 255;
}

function isBracketedByWrappedBands(midY, bands) {
  let hasUpper = false;
  let hasLower = false;
  for (const band of bands) {
    if (band.centerY < midY) hasUpper = true;
    if (band.centerY > midY) {
      hasLower = true;
      break;
    }
  }
  return hasUpper && hasLower;
}

function localReliefPeak(data, width, height, x, startY, step) {
  let peak = BODY_HEIGHT;
  let y = startY;
  for (let sample = 0; sample < RELIEF_SAMPLE_DEPTH; sample += 1, y += step) {
    if (y < 0 || y >= height) break;
    const offset = (y * width + x) * 4;
    peak = Math.max(peak, data[offset]);
  }
  return peak;
}

function bridgeReliefRun(relief, width, height, x, start, end) {
  if (!relief) return 0;
  const topPeak = localReliefPeak(relief.data, width, height, x, start - 1, -1);
  const bottomPeak = localReliefPeak(relief.data, width, height, x, end + 1, 1);
  if (
    topPeak <= BODY_HEIGHT + RELIEF_BODY_TOLERANCE ||
    bottomPeak <= BODY_HEIGHT + RELIEF_BODY_TOLERANCE
  ) {
    return 0;
  }

  const runLength = end - start + 1;
  for (let fillY = start; fillY <= end; fillY += 1) {
    const t = (fillY - start + 1) / (runLength + 1);
    const value = topPeak + (bottomPeak - topPeak) * t;
    writeScalarPixel(relief.data, (fillY * width + x) * 4, value);
  }
  return runLength;
}

function bridgeRoughnessRun(roughness, width, x, start, end) {
  if (!roughness) return;
  const topOffset = ((start - 1) * width + x) * 4;
  const bottomOffset = ((end + 1) * width + x) * 4;
  const topValue = roughness.data[topOffset];
  const bottomValue = roughness.data[bottomOffset];
  const runLength = end - start + 1;
  for (let fillY = start; fillY <= end; fillY += 1) {
    const t = (fillY - start + 1) / (runLength + 1);
    writeScalarPixel(
      roughness.data,
      (fillY * width + x) * 4,
      topValue + (bottomValue - topValue) * t,
    );
  }
}

function readableScalarCanvas(texture, width, height) {
  const canvas = texture?.image;
  if (
    !canvas ||
    canvas.width !== width ||
    canvas.height !== height ||
    typeof canvas.getContext !== 'function'
  ) {
    return null;
  }
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  return {
    canvas,
    context,
    image: context.getImageData(0, 0, width, height),
    texture,
  };
}

function fillInternalBandGaps(entity) {
  const manifest = entity?.drawingManifest;
  const material = entity?.mesh?.material;
  const canvas = material?.map?.image;
  if (
    !manifest ||
    !RGB_HEX.test(manifest.background_color || '') ||
    !Array.isArray(manifest.strokes) ||
    !material?.userData?.kidsGalaxyManifestStrokeSurface ||
    !canvas ||
    typeof canvas.getContext !== 'function'
  ) {
    return 0;
  }

  const bands = manifest.strokes.map(projectedBand).filter(Boolean).sort((a, b) => a.centerY - b.centerY);
  if (bands.length < 2) return 0;

  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return 0;

  const width = canvas.width;
  const height = canvas.height;
  const background = rgbOf(manifest.background_color);
  const image = context.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(image.data);
  const relief = readableScalarCanvas(material.displacementMap, width, height);
  const roughness = readableScalarCanvas(material.roughnessMap, width, height);
  let filledTexels = 0;
  let filledReliefTexels = 0;
  let widestFilledRun = 0;

  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height) {
      const offset = (y * width + x) * 4;
      if (!isBackgroundPixel(source, offset, background)) {
        y += 1;
        continue;
      }

      const start = y;
      while (y < height) {
        const runOffset = (y * width + x) * 4;
        if (!isBackgroundPixel(source, runOffset, background)) break;
        y += 1;
      }
      const end = y - 1;
      const runLength = end - start + 1;

      // A run touching a texture pole is exterior body/background, not a hole
      // between paint bands. Never extend the nearest paint into that region.
      if (start === 0 || end === height - 1) continue;

      const midY = ((start + end) * 0.5) / Math.max(1, height - 1);
      if (!isBracketedByWrappedBands(midY, bands)) continue;

      const topOffset = ((start - 1) * width + x) * 4;
      const bottomOffset = ((end + 1) * width + x) * 4;
      if (
        isBackgroundPixel(source, topOffset, background) ||
        isBackgroundPixel(source, bottomOffset, background)
      ) {
        continue;
      }

      widestFilledRun = Math.max(widestFilledRun, runLength);
      for (let fillY = start; fillY <= end; fillY += 1) {
        const targetOffset = (fillY * width + x) * 4;
        const distanceToTop = fillY - (start - 1);
        const distanceToBottom = end + 1 - fillY;
        copyPixel(
          image.data,
          targetOffset,
          distanceToTop <= distanceToBottom ? topOffset : bottomOffset,
        );
        filledTexels += 1;
      }

      // The previous fixes only repainted the base sphere. In the real WebGL
      // scene that base remained deeply recessed between displaced ribbons, so
      // lighting made it look black anyway. Bridge the displacement itself for
      // the same internal run, interpolating between nearby raised band peaks.
      // Exterior background is still untouched because pole-touching runs were
      // rejected above.
      filledReliefTexels += bridgeReliefRun(relief?.image, width, height, x, start, end);
      bridgeRoughnessRun(roughness?.image, width, x, start, end);
    }
  }

  if (filledTexels > 0) {
    context.putImageData(image, 0, 0);
    material.map.needsUpdate = true;
  }
  if (filledReliefTexels > 0 && relief) {
    relief.context.putImageData(relief.image, 0, 0);
    relief.texture.needsUpdate = true;
  }
  if (filledReliefTexels > 0 && roughness) {
    roughness.context.putImageData(roughness.image, 0, 0);
    roughness.texture.needsUpdate = true;
  }

  material.userData.kidsGalaxyInternalGapFillTexels = filledTexels;
  material.userData.kidsGalaxyInternalGapReliefTexels = filledReliefTexels;
  material.userData.kidsGalaxyInternalGapFillWidestRun = widestFilledRun;
  material.userData.kidsGalaxyInternalGapFillVersion = 3;
  return filledTexels;
}

export function installManifestInternalGapFill() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyManifestInternalGapFill) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function manifestInternalGapFill(texture) {
    previousApplyTexture.call(this, texture);
    try {
      fillInternalBandGaps(this);
    } catch (error) {
      console.error('Kids Galaxy internal manifest gap fill failed', this.id, error);
    }
  }

  manifestInternalGapFill.kidsGalaxyManifestInternalGapFill = true;
  PlanetEntity.prototype.applyTexture = manifestInternalGapFill;
}
