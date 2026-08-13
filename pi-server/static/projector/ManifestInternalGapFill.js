import { PlanetEntity } from './PlanetEntity.js';

const RGB_HEX = /^#[0-9a-fA-F]{6}$/;
const VERTICAL_ASPECT_THRESHOLD = 1.55;
const WRAP_ASPECT_THRESHOLD = 0.72;
const BACKGROUND_DISTANCE_THRESHOLD = 18;
const BODY_HEIGHT = 26;
const RELIEF_SAMPLE_DEPTH = 12;

function rgbOf(value) {
  const colour = typeof value === 'string' && RGB_HEX.test(value) ? value : '#000000';
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ];
}

function bandOf(stroke) {
  const points = Array.isArray(stroke?.points)
    ? stroke.points.filter(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]),
      )
    : [];
  if (points.length < 2) return null;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let sumY = 0;
  points.forEach(([rawX, rawY]) => {
    const x = Math.max(0, Math.min(1, rawX));
    const y = Math.max(0, Math.min(1, rawY));
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumY += y;
  });

  const spanX = Math.max(0.0001, maxX - minX);
  const spanY = Math.max(0.0001, maxY - minY);
  const nearVertical = spanY / spanX >= VERTICAL_ASPECT_THRESHOLD;
  if (nearVertical || spanX / spanY < WRAP_ASPECT_THRESHOLD) return null;

  const width = Math.max(
    0.003,
    Math.min(0.35, Number(stroke.width_normalized) || Number(stroke.width_px) / 512 || 0.02),
  );
  return {
    centerY: sumY / points.length,
    fromY: Math.max(0, minY - width * 0.5),
    toY: Math.min(1, maxY + width * 0.5),
  };
}

function isBackground(data, offset, background) {
  const dr = data[offset] - background[0];
  const dg = data[offset + 1] - background[1];
  const db = data[offset + 2] - background[2];
  return dr * dr + dg * dg + db * db <= BACKGROUND_DISTANCE_THRESHOLD ** 2;
}

function copyRgb(data, targetOffset, sourceOffset) {
  data[targetOffset] = data[sourceOffset];
  data[targetOffset + 1] = data[sourceOffset + 1];
  data[targetOffset + 2] = data[sourceOffset + 2];
}

function writeScalar(data, offset, value) {
  const scalar = Math.max(0, Math.min(255, Math.round(value)));
  data[offset] = scalar;
  data[offset + 1] = scalar;
  data[offset + 2] = scalar;
  data[offset + 3] = 255;
}

function bracketed(midY, bands) {
  return bands.some((band) => band.centerY < midY) && bands.some((band) => band.centerY > midY);
}

function scalarCanvas(texture, width, height) {
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
    context,
    image: context.getImageData(0, 0, width, height),
    texture,
  };
}

function reliefPeak(data, width, height, x, y, step) {
  let peak = BODY_HEIGHT;
  for (let sample = 0; sample < RELIEF_SAMPLE_DEPTH; sample += 1, y += step) {
    if (y < 0 || y >= height) break;
    peak = Math.max(peak, data[(y * width + x) * 4]);
  }
  return peak;
}

function bridgeRelief(relief, width, height, x, start, end) {
  if (!relief) return 0;
  const top = reliefPeak(relief.data, width, height, x, start - 1, -1);
  const bottom = reliefPeak(relief.data, width, height, x, end + 1, 1);
  if (top <= BODY_HEIGHT + 2 || bottom <= BODY_HEIGHT + 2) return 0;

  const length = end - start + 1;
  for (let y = start; y <= end; y += 1) {
    const t = (y - start + 1) / (length + 1);
    writeScalar(relief.data, (y * width + x) * 4, top + (bottom - top) * t);
  }
  return length;
}

function bridgeRoughness(roughness, width, x, start, end) {
  if (!roughness) return;
  const top = roughness.data[((start - 1) * width + x) * 4];
  const bottom = roughness.data[((end + 1) * width + x) * 4];
  const length = end - start + 1;
  for (let y = start; y <= end; y += 1) {
    const t = (y - start + 1) / (length + 1);
    writeScalar(roughness.data, (y * width + x) * 4, top + (bottom - top) * t);
  }
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

  const bands = manifest.strokes.map(bandOf).filter(Boolean).sort((a, b) => a.centerY - b.centerY);
  if (bands.length < 2) return 0;

  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return 0;
  const width = canvas.width;
  const height = canvas.height;
  const background = rgbOf(manifest.background_color);
  const image = context.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(image.data);
  const relief = scalarCanvas(material.displacementMap, width, height);
  const roughness = scalarCanvas(material.roughnessMap, width, height);
  let filledTexels = 0;
  let filledReliefTexels = 0;
  let widestFilledRun = 0;

  for (let x = 0; x < width; x += 1) {
    let y = 0;
    while (y < height) {
      if (!isBackground(source, (y * width + x) * 4, background)) {
        y += 1;
        continue;
      }

      const start = y;
      while (y < height && isBackground(source, (y * width + x) * 4, background)) y += 1;
      const end = y - 1;
      if (start === 0 || end === height - 1) continue;

      const midY = ((start + end) * 0.5) / Math.max(1, height - 1);
      if (!bracketed(midY, bands)) continue;

      const topOffset = ((start - 1) * width + x) * 4;
      const bottomOffset = ((end + 1) * width + x) * 4;
      if (isBackground(source, topOffset, background) || isBackground(source, bottomOffset, background)) {
        continue;
      }

      const runLength = end - start + 1;
      widestFilledRun = Math.max(widestFilledRun, runLength);
      for (let fillY = start; fillY <= end; fillY += 1) {
        const targetOffset = (fillY * width + x) * 4;
        const topDistance = fillY - start + 1;
        const bottomDistance = end - fillY + 1;
        copyRgb(image.data, targetOffset, topDistance <= bottomDistance ? topOffset : bottomOffset);
        filledTexels += 1;
      }

      // Colour alone still leaves the base sphere recessed between strongly
      // displaced ribbons. In the real scene that trench falls into shadow and
      // reads as black. Raise only these internal runs by interpolating between
      // nearby band peaks; pole-touching exterior background remains untouched.
      filledReliefTexels += bridgeRelief(relief?.image, width, height, x, start, end);
      bridgeRoughness(roughness?.image, width, x, start, end);
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
  material.userData.kidsGalaxyInternalGapFillVersion = 2;
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
