import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const DISC_SIZE = 256;
const GRID = 128;
const MAX_COLORS = 3;
const MAX_EXPLICIT_BODY_COLORS = 6;
const MAX_SECONDARY_COMPONENTS = 7;
const MAX_EXPLICIT_BODY_COMPONENTS = 9;
const MAX_DOMINANT_COMPONENTS = 2;
const MAX_BACK_ECHO_COMPONENTS = 7;
const MAX_EXPLICIT_BACK_ECHO_COMPONENTS = 9;
const MIN_COMPONENT_CELLS = 14;
const MIN_DOMINANT_GESTURE_COVERAGE = 0.035;
const MAX_DOMINANT_GESTURE_COVERAGE = 0.48;
const ARTWORK_TARGET_FILL = 0.94;
const ARTWORK_MAX_FIT_SCALE = 1.55;
const EXPLICIT_ARTWORK_MAX_FIT_SCALE = 1.85;
const BODY_MATCH_DISTANCE = 54;
const BODY_RADIUS = 1.05;
const BASE_RADIUS = 1.056;
const SHOULDER_RADIUS = 1.079;
const TOP_RADIUS = 1.107;
const DOMINANT_BASE_RADIUS = 1.053;
const DOMINANT_SHOULDER_RADIUS = 1.064;
const DOMINANT_TOP_RADIUS = 1.08;

const PALETTE = [
  [0xe5, 0x39, 0x35],
  [0xff, 0x98, 0x00],
  [0xff, 0xeb, 0x3b],
  [0x4c, 0xaf, 0x50],
  [0x21, 0x96, 0xf3],
  [0x9c, 0x27, 0xb0],
  [0xe9, 0x1e, 0x63],
  [0x00, 0x00, 0x00],
  [0xff, 0xff, 0xff],
];

function makeCanvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

function imageSize(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 0,
  };
}

function parseHexColour(value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value || '')) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function rgbDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function whiteDistance(r, g, b) {
  return rgbDistance([r, g, b], [255, 255, 255]) / 441.673;
}

function paletteIndex(r, g, b) {
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  PALETTE.forEach((rgb, index) => {
    const dr = r - rgb[0];
    const dg = g - rgb[1];
    const db = b - rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance >= best) return;
    best = distance;
    nearest = index;
  });
  return nearest;
}

function recoverLegacy(source) {
  const sourceContext = source.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!sourceContext) return null;
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const output = makeCanvas(DISC_SIZE, DISC_SIZE);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return null;
  const pixels = context.createImageData(DISC_SIZE, DISC_SIZE);
  const centre = (DISC_SIZE - 1) / 2;
  const radius = DISC_SIZE * 0.485;

  for (let y = 0; y < DISC_SIZE; y += 1) {
    for (let x = 0; x < DISC_SIZE; x += 1) {
      const nx = (x - centre) / radius;
      const ny = (y - centre) / radius;
      const radial = Math.hypot(nx, ny);
      const dst = (y * DISC_SIZE + x) * 4;
      if (radial > 1) {
        pixels.data[dst] = 255;
        pixels.data[dst + 1] = 255;
        pixels.data[dst + 2] = 255;
        pixels.data[dst + 3] = 255;
        continue;
      }
      let angle = Math.atan2(ny, nx) / (Math.PI * 2);
      if (angle < 0) angle += 1;
      const sx = Math.min(source.width - 1, Math.floor(angle * source.width));
      const sy = Math.min(source.height - 1, Math.floor(radial * source.height));
      const src = (sy * source.width + sx) * 4;
      pixels.data[dst] = sourcePixels[src];
      pixels.data[dst + 1] = sourcePixels[src + 1];
      pixels.data[dst + 2] = sourcePixels[src + 2];
      pixels.data[dst + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return output;
}

function isAuthoredPixel(r, g, b, explicitBodyRgb) {
  if (explicitBodyRgb) {
    return rgbDistance([r, g, b], explicitBodyRgb) > BODY_MATCH_DISTANCE;
  }
  return whiteDistance(r, g, b) >= 0.08;
}

function paintedBounds(disc, explicitBodyRgb = null) {
  const context = disc.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  const pixels = context.getImageData(0, 0, disc.width, disc.height).data;
  let minX = disc.width;
  let minY = disc.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < disc.height; y += 1) {
    for (let x = 0; x < disc.width; x += 1) {
      const nx = ((x + 0.5) / disc.width - 0.5) * 2;
      const ny = ((y + 0.5) / disc.height - 0.5) * 2;
      if (nx * nx + ny * ny > 0.965 * 0.965) continue;
      const pixel = (y * disc.width + x) * 4;
      if (!isAuthoredPixel(
        pixels[pixel],
        pixels[pixel + 1],
        pixels[pixel + 2],
        explicitBodyRgb,
      )) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function fitArtworkToDisc(disc, explicitBodyRgb = null) {
  const bounds = paintedBounds(disc, explicitBodyRgb);
  if (!bounds) {
    disc.kidsGalaxyArtworkFitScale = 1;
    disc.kidsGalaxyArtworkFitScaleX = 1;
    disc.kidsGalaxyArtworkFitScaleY = 1;
    return disc;
  }

  const targetPixels = DISC_SIZE * ARTWORK_TARGET_FILL;
  const maximumScale = explicitBodyRgb
    ? EXPLICIT_ARTWORK_MAX_FIT_SCALE
    : ARTWORK_MAX_FIT_SCALE;
  const fitScaleX = THREE.MathUtils.clamp(
    targetPixels / bounds.width,
    1,
    maximumScale,
  );
  const fitScaleY = THREE.MathUtils.clamp(
    targetPixels / bounds.height,
    1,
    maximumScale,
  );
  const fitScale = explicitBodyRgb
    ? Math.max(fitScaleX, fitScaleY)
    : Math.min(fitScaleX, fitScaleY);

  if (!explicitBodyRgb && fitScale <= 1.01) {
    disc.kidsGalaxyArtworkFitScale = 1;
    disc.kidsGalaxyArtworkFitScaleX = 1;
    disc.kidsGalaxyArtworkFitScaleY = 1;
    disc.kidsGalaxyArtworkSourceBounds = bounds;
    return disc;
  }

  const output = makeCanvas(DISC_SIZE, DISC_SIZE);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return disc;
  if (explicitBodyRgb) {
    context.fillStyle = `rgb(${explicitBodyRgb[0]}, ${explicitBodyRgb[1]}, ${explicitBodyRgb[2]})`;
  } else {
    context.fillStyle = '#fff';
  }
  context.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const sourceCentreX = (bounds.minX + bounds.maxX + 1) / 2;
  const sourceCentreY = (bounds.minY + bounds.maxY + 1) / 2;
  const targetWidth = bounds.width * (explicitBodyRgb ? fitScaleX : fitScale);
  const targetHeight = bounds.height * (explicitBodyRgb ? fitScaleY : fitScale);
  context.drawImage(
    disc,
    bounds.minX,
    bounds.minY,
    bounds.width,
    bounds.height,
    (DISC_SIZE - targetWidth) / 2,
    (DISC_SIZE - targetHeight) / 2,
    targetWidth,
    targetHeight,
  );
  output.kidsGalaxyArtworkFitScale = fitScale;
  output.kidsGalaxyArtworkFitScaleX = explicitBodyRgb ? fitScaleX : fitScale;
  output.kidsGalaxyArtworkFitScaleY = explicitBodyRgb ? fitScaleY : fitScale;
  output.kidsGalaxyArtworkSourceBounds = bounds;
  output.kidsGalaxyArtworkSourceCentre = [sourceCentreX, sourceCentreY];
  return output;
}

function recoverDisc(texture, explicitBodyRgb = null) {
  if (typeof document === 'undefined' || !texture?.image) return null;
  const size = imageSize(texture.image);
  if (!size.width || !size.height) return null;
  const legacy = size.width >= size.height * 1.45;
  const source = makeCanvas(legacy ? 512 : DISC_SIZE, legacy ? 256 : DISC_SIZE);
  const context = source.getContext('2d', { alpha: false });
  if (!context) return null;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, source.width, source.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(texture.image, 0, 0, source.width, source.height);
  if (legacy) {
    const recovered = recoverLegacy(source);
    return recovered ? fitArtworkToDisc(recovered, explicitBodyRgb) : null;
  }

  const disc = makeCanvas(DISC_SIZE, DISC_SIZE);
  const discContext = disc.getContext('2d', { alpha: false });
  if (!discContext) return null;
  discContext.fillStyle = explicitBodyRgb
    ? `rgb(${explicitBodyRgb[0]}, ${explicitBodyRgb[1]}, ${explicitBodyRgb[2]})`
    : '#fff';
  discContext.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  discContext.imageSmoothingEnabled = true;
  discContext.drawImage(source, 0, 0, DISC_SIZE, DISC_SIZE);
  return fitArtworkToDisc(disc, explicitBodyRgb);
}

function indexOf(x, y) {
  return y * GRID + x;
}

function sampledColour(sums, counts, colour) {
  const count = Math.max(1, counts[colour]);
  return new THREE.Color().setRGB(
    sums[colour][0] / count / 255,
    sums[colour][1] / count / 255,
    sums[colour][2] / count / 255,
    THREE.SRGBColorSpace,
  );
}

function analyse(texture, explicitBodyColor = null) {
  const explicitBodyRgb = parseHexColour(explicitBodyColor);
  const disc = recoverDisc(texture, explicitBodyRgb);
  if (!disc) return null;
  const sample = makeCanvas(GRID, GRID);
  const context = sample.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = explicitBodyRgb
    ? `rgb(${explicitBodyRgb[0]}, ${explicitBodyRgb[1]}, ${explicitBodyRgb[2]})`
    : '#fff';
  context.fillRect(0, 0, GRID, GRID);
  context.imageSmoothingEnabled = true;
  context.drawImage(disc, 0, 0, GRID, GRID);
  const pixels = context.getImageData(0, 0, GRID, GRID).data;
  const labels = new Int16Array(GRID * GRID);
  labels.fill(-1);
  const counts = new Array(PALETTE.length).fill(0);
  const sums = PALETTE.map(() => [0, 0, 0]);
  let inside = 0;

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const nx = ((x + 0.5) / GRID - 0.5) * 2;
      const ny = ((y + 0.5) / GRID - 0.5) * 2;
      if (nx * nx + ny * ny > 0.965 * 0.965) continue;
      inside += 1;
      const pixel = indexOf(x, y) * 4;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      if (!isAuthoredPixel(r, g, b, explicitBodyRgb)) continue;
      const colour = paletteIndex(r, g, b);
      if (
        explicitBodyRgb &&
        rgbDistance(PALETTE[colour], explicitBodyRgb) <= BODY_MATCH_DISTANCE
      ) {
        continue;
      }
      labels[indexOf(x, y)] = colour;
      counts[colour] += 1;
      sums[colour][0] += r;
      sums[colour][1] += g;
      sums[colour][2] += b;
    }
  }

  if (explicitBodyRgb) {
    const accentColours = counts
      .map((count, index) => ({ count, index }))
      .filter(({ count }) => count >= Math.max(10, inside * 0.002))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_EXPLICIT_BODY_COLORS)
      .map(({ index }) => index);
    const colours = new Map();
    accentColours.forEach((colour) => {
      colours.set(colour, sampledColour(sums, counts, colour));
    });
    return {
      labels,
      accentColours,
      colours,
      inside,
      dominant: -1,
      dominantCoverage: 0,
      preserveDominantGesture: false,
      explicitBodyColor: explicitBodyColor.toLowerCase(),
      artworkFitScale: Number(disc.kidsGalaxyArtworkFitScale) || 1,
      artworkFitScaleX: Number(disc.kidsGalaxyArtworkFitScaleX) || 1,
      artworkFitScaleY: Number(disc.kidsGalaxyArtworkFitScaleY) || 1,
      artworkSourceBounds: disc.kidsGalaxyArtworkSourceBounds || null,
    };
  }

  let dominant = 0;
  counts.forEach((count, index) => {
    if (count > counts[dominant]) dominant = index;
  });
  const dominantCoverage = counts[dominant] / Math.max(1, inside);
  const preserveDominantGesture =
    dominantCoverage >= MIN_DOMINANT_GESTURE_COVERAGE &&
    dominantCoverage <= MAX_DOMINANT_GESTURE_COVERAGE;

  const secondaryColours = counts
    .map((count, index) => ({ count, index }))
    .filter(({ count, index }) => count >= Math.max(10, inside * 0.002) && index !== dominant)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_COLORS)
    .map(({ index }) => index);
  const accentColours = preserveDominantGesture
    ? [dominant, ...secondaryColours]
    : secondaryColours;

  const colours = new Map();
  accentColours.forEach((colour) => {
    const sampled = sampledColour(sums, counts, colour);
    if (colour === dominant && preserveDominantGesture) {
      sampled.offsetHSL(0, 0.012, 0.045);
    }
    colours.set(colour, sampled);
  });

  return {
    labels,
    accentColours,
    colours,
    inside,
    dominant,
    dominantCoverage,
    preserveDominantGesture,
    explicitBodyColor: null,
    artworkFitScale: Number(disc.kidsGalaxyArtworkFitScale) || 1,
    artworkFitScaleX: Number(disc.kidsGalaxyArtworkFitScaleX) || 1,
    artworkFitScaleY: Number(disc.kidsGalaxyArtworkFitScaleY) || 1,
    artworkSourceBounds: disc.kidsGalaxyArtworkSourceBounds || null,
  };
}

function componentsFor(analysis) {
  const components = [];
  const visited = new Uint8Array(GRID * GRID);
  const neighbours = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const selected = new Set(analysis.accentColours);

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const start = indexOf(x, y);
      const colour = analysis.labels[start];
      if (colour < 0 || !selected.has(colour) || visited[start]) continue;
      const queue = [start];
      const cells = [];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        cells.push(current);
        const cy = Math.floor(current / GRID);
        const cx = current % GRID;
        neighbours.forEach(([dx, dy]) => {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) return;
          const next = indexOf(nx, ny);
          if (visited[next] || analysis.labels[next] !== colour) return;
          visited[next] = 1;
          queue.push(next);
        });
      }
      if (cells.length >= MIN_COMPONENT_CELLS) {
        components.push({
          colour,
          cells,
          isDominantGesture:
            analysis.preserveDominantGesture && colour === analysis.dominant,
        });
      }
    }
  }

  const secondary = components
    .filter((component) => !component.isDominantGesture)
    .sort((a, b) => b.cells.length - a.cells.length)
    .slice(
      0,
      analysis.explicitBodyColor
        ? MAX_EXPLICIT_BODY_COMPONENTS
        : MAX_SECONDARY_COMPONENTS,
    );
  const dominant = components
    .filter((component) => component.isDominantGesture)
    .sort((a, b) => b.cells.length - a.cells.length)
    .slice(0, MAX_DOMINANT_COMPONENTS);
  return [...secondary, ...dominant].sort((a, b) => b.cells.length - a.cells.length);
}

function contourEdges(component) {
  const occupied = new Set(component.cells);
  const edges = [];
  component.cells.forEach((cell) => {
    const y = Math.floor(cell / GRID);
    const x = cell % GRID;
    if (y === 0 || !occupied.has(indexOf(x, y - 1))) edges.push([[x, y], [x + 1, y]]);
    if (x === GRID - 1 || !occupied.has(indexOf(x + 1, y))) edges.push([[x + 1, y], [x + 1, y + 1]]);
    if (y === GRID - 1 || !occupied.has(indexOf(x, y + 1))) edges.push([[x + 1, y + 1], [x, y + 1]]);
    if (x === 0 || !occupied.has(indexOf(x - 1, y))) edges.push([[x, y + 1], [x, y]]);
  });
  return edges;
}

function pointKey(point) {
  return `${point[0]},${point[1]}`;
}

function loopsFromEdges(edges) {
  const outgoing = new Map();
  edges.forEach(([start, end]) => {
    const key = pointKey(start);
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(end);
  });

  const loops = [];
  while (outgoing.size) {
    const [startKey, ends] = outgoing.entries().next().value;
    const [sx, sy] = startKey.split(',').map(Number);
    const loop = [[sx, sy]];
    let current = ends.pop();
    if (!ends.length) outgoing.delete(startKey);
    let guard = 0;
    while (current && pointKey(current) !== startKey && guard < edges.length + 4) {
      loop.push(current);
      const key = pointKey(current);
      const nextList = outgoing.get(key);
      if (!nextList?.length) break;
      current = nextList.pop();
      if (!nextList.length) outgoing.delete(key);
      guard += 1;
    }
    if (loop.length >= 6 && current && pointKey(current) === startKey) loops.push(loop);
  }
  return loops;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function normalizeLoop(loop) {
  const points = loop.map(([x, y]) => new THREE.Vector2(
    ((x / GRID) - 0.5) * 2,
    (0.5 - y / GRID) * 2,
  ));
  if (polygonArea(points) < 0) points.reverse();
  return points;
}

function chaikin(points, iterations = 2) {
  let result = points;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = [];
    for (let i = 0; i < result.length; i += 1) {
      const a = result[i];
      const b = result[(i + 1) % result.length];
      next.push(new THREE.Vector2(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      next.push(new THREE.Vector2(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    result = next;
  }
  return result;
}

function decimate(points, maximum = 96) {
  if (points.length <= maximum) return points;
  const step = points.length / maximum;
  const output = [];
  for (let cursor = 0; cursor < points.length; cursor += step) {
    output.push(points[Math.floor(cursor) % points.length]);
  }
  return output;
}

function componentContour(component) {
  const loops = loopsFromEdges(contourEdges(component));
  if (!loops.length) return null;
  const candidates = loops.map(normalizeLoop);
  candidates.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return decimate(chaikin(candidates[0], 2));
}

function centroid(points) {
  const result = new THREE.Vector2();
  points.forEach((point) => result.add(point));
  return result.multiplyScalar(1 / Math.max(1, points.length));
}

function scaledContour(points, scale, centre) {
  return points.map((point) => centre.clone().add(point.clone().sub(centre).multiplyScalar(scale)));
}

function spherePoint(point, radius, back = false, backRotation = 0) {
  let x = point.x * 0.965;
  let y = point.y * 0.965;
  const length = Math.hypot(x, y);
  if (length > 0.94) {
    const factor = 0.94 / length;
    x *= factor;
    y *= factor;
  }
  const z = Math.sqrt(Math.max(0.04, 1 - x * x - y * y));
  const vector = new THREE.Vector3(x, y, back ? -z : z).normalize();
  if (back && backRotation) vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), backRotation);
  return vector.multiplyScalar(radius);
}

function rgbTriplet(colour) {
  return [colour.r, colour.g, colour.b];
}

function createPatchGeometry(
  contour,
  colour,
  { back = false, backRotation = 0, scale = 1, dominantGesture = false } = {},
) {
  const centre = centroid(contour);
  const outer = scaledContour(contour, 1.035 * scale, centre);
  const shoulder = scaledContour(contour, 0.985 * scale, centre);
  const top = scaledContour(contour, 0.92 * scale, centre);
  const baseRadius = dominantGesture ? DOMINANT_BASE_RADIUS : BASE_RADIUS;
  const shoulderRadius = dominantGesture ? DOMINANT_SHOULDER_RADIUS : SHOULDER_RADIUS;
  const topRadius = dominantGesture ? DOMINANT_TOP_RADIUS : TOP_RADIUS;
  const rings = [
    {
      points: outer,
      radius: baseRadius,
      colour: colour.clone().offsetHSL(0, -0.006, dominantGesture ? -0.035 : -0.13),
    },
    {
      points: shoulder,
      radius: shoulderRadius,
      colour: colour.clone().offsetHSL(0, -0.003, dominantGesture ? -0.012 : -0.055),
    },
    {
      points: top,
      radius: topRadius,
      colour: colour.clone().offsetHSL(0, 0.012, dominantGesture ? 0.018 : 0.045),
    },
  ];

  const positions = [];
  const colors = [];
  rings.forEach((ring) => {
    ring.points.forEach((point) => {
      const vertex = spherePoint(point, ring.radius, back, backRotation);
      positions.push(vertex.x, vertex.y, vertex.z);
      colors.push(...rgbTriplet(ring.colour));
    });
  });

  const n = contour.length;
  const indices = [];
  for (let ring = 0; ring < 2; ring += 1) {
    const start = ring * n;
    const nextStart = (ring + 1) * n;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      indices.push(start + i, nextStart + i, start + j);
      indices.push(start + j, nextStart + i, nextStart + j);
    }
  }

  const topShape = top.map((point) => point.clone());
  const triangles = THREE.ShapeUtils.triangulateShape(topShape, []);
  triangles.forEach(([a, b, c]) => {
    indices.push(2 * n + a, 2 * n + b, 2 * n + c);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.kidsGalaxySculptedKidPatch = true;
  geometry.userData.kidsGalaxyBeveledKidPatch = true;
  geometry.userData.kidsGalaxyDominantGesturePatch = dominantGesture;
  geometry.userData.kidsGalaxyPatchVertexCount = positions.length / 3;
  geometry.userData.kidsGalaxyPatchRelief = topRadius - BODY_RADIUS;
  geometry.userData.kidsGalaxyPatchBackEcho = back;
  return geometry;
}

function patchMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.44,
    metalness: 0.001,
    clearcoat: 0.07,
    clearcoatRoughness: 0.64,
    side: THREE.FrontSide,
  });
}

function disposeGroup(group) {
  if (!group) return;
  group.parent?.remove(group);
  group.traverse((child) => {
    child.geometry?.dispose();
    if (child.material) child.material.dispose();
  });
}

function markCleanBody(entity, analysis) {
  entity.accentEdgeMesh.visible = false;
  entity.accentMesh.visible = false;
  const data = entity.mesh.material.userData;
  data.kidsGalaxyTrueSculptedArtwork = true;
  data.kidsGalaxySculptedPatchCount = 0;
  data.kidsGalaxyDominantGesturePatchCount = 0;
  data.kidsGalaxyDominantGestureCoverage = analysis.dominantCoverage;
  data.kidsGalaxyArtworkFitScale = analysis.artworkFitScale;
  data.kidsGalaxyArtworkFitScaleX = analysis.artworkFitScaleX;
  data.kidsGalaxyArtworkFitScaleY = analysis.artworkFitScaleY;
  if (analysis.explicitBodyColor) {
    data.kidsGalaxyExplicitBodyArtwork = true;
    data.kidsGalaxyExplicitBodyPatchCount = 0;
    data.kidsGalaxyBodyColorInferenceDisabled = true;
    data.designProjection = 'explicit-body-preserved-kid-traits-across-planet';
  } else {
    data.designProjection = 'clean-dominant-body-no-redundant-patch';
  }
}

function buildSculptedArtwork(entity, texture) {
  const analysis = analyse(texture, entity.bodyColor);
  if (!analysis) return false;
  const components = componentsFor(analysis)
    .map((component) => ({ ...component, contour: componentContour(component) }))
    .filter((component) => component.contour?.length >= 6);

  disposeGroup(entity.sculptedArtworkGroup);
  if (!components.length) {
    markCleanBody(entity, analysis);
    return true;
  }

  const explicitBody = Boolean(analysis.explicitBodyColor);
  const group = new THREE.Group();
  group.userData.kidsGalaxySculptedArtworkGroup = true;
  group.userData.componentCount = components.length;
  group.userData.kidsGalaxyArtworkFitScale = analysis.artworkFitScale;
  group.userData.kidsGalaxyArtworkFitScaleX = analysis.artworkFitScaleX;
  group.userData.kidsGalaxyArtworkFitScaleY = analysis.artworkFitScaleY;
  group.userData.kidsGalaxyArtworkTargetFill = ARTWORK_TARGET_FILL;
  if (explicitBody) {
    group.userData.kidsGalaxyExplicitBodyArtwork = true;
    group.userData.kidsGalaxyBodyColor = analysis.explicitBodyColor;
  }

  const seed = entity.animator.hashId(`${entity.id}-sculpted-back-echo`);
  const backRotation = 0.34 + entity.seededUnit(seed, 5) * 0.28;
  const backEchoLimit = explicitBody
    ? MAX_EXPLICIT_BACK_ECHO_COMPONENTS
    : MAX_BACK_ECHO_COMPONENTS;
  let dominantGestureCount = 0;
  let secondaryCount = 0;
  let backEchoCount = 0;

  components.forEach((component, index) => {
    const colour = analysis.colours.get(component.colour) || new THREE.Color(0xffffff);
    const mesh = new THREE.Mesh(
      createPatchGeometry(component.contour, colour, {
        dominantGesture: component.isDominantGesture,
      }),
      patchMaterial(),
    );
    mesh.userData.kidsGalaxySculptedKidPatch = true;
    mesh.userData.kidsGalaxyKidPatchIndex = index;
    mesh.userData.kidsGalaxyDominantGesturePatch = component.isDominantGesture;
    if (explicitBody) {
      mesh.userData.kidsGalaxyExplicitBodyPatch = true;
      mesh.geometry.userData.kidsGalaxyExplicitBodyPatch = true;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (component.isDominantGesture) dominantGestureCount += 1;
    else secondaryCount += 1;

    if (backEchoCount < backEchoLimit) {
      const back = new THREE.Mesh(
        createPatchGeometry(component.contour, colour, {
          back: true,
          backRotation,
          scale: component.isDominantGesture ? 0.94 : 0.98,
          dominantGesture: component.isDominantGesture,
        }),
        patchMaterial(),
      );
      back.userData.kidsGalaxySculptedKidPatch = true;
      back.userData.kidsGalaxyBackDesignEcho = true;
      back.userData.kidsGalaxyDominantGesturePatch = component.isDominantGesture;
      if (explicitBody) {
        back.userData.kidsGalaxyExplicitBodyPatch = true;
        back.geometry.userData.kidsGalaxyExplicitBodyPatch = true;
      }
      back.castShadow = true;
      back.receiveShadow = true;
      group.add(back);
      backEchoCount += 1;
    }
  });

  entity.mesh.add(group);
  entity.sculptedArtworkGroup = group;
  entity.accentEdgeMesh.visible = false;
  entity.accentMesh.visible = false;
  const data = entity.mesh.material.userData;
  data.kidsGalaxyTrueSculptedArtwork = true;
  data.kidsGalaxySculptedPatchCount = components.length;
  data.kidsGalaxySecondaryPatchCount = secondaryCount;
  data.kidsGalaxyDominantGesturePatchCount = dominantGestureCount;
  data.kidsGalaxyDominantGestureCoverage = analysis.dominantCoverage;
  data.kidsGalaxyDominantGestureStyle = explicitBody
    ? 'explicit-body-all-nonbody-colors-are-artwork'
    : 'same-hue-sculpted-ribbons';
  data.kidsGalaxySculptedBackEchoCount = backEchoCount;
  data.kidsGalaxyArtworkFitScale = analysis.artworkFitScale;
  data.kidsGalaxyArtworkFitScaleX = analysis.artworkFitScaleX;
  data.kidsGalaxyArtworkFitScaleY = analysis.artworkFitScaleY;
  data.kidsGalaxyArtworkTargetFill = ARTWORK_TARGET_FILL;
  data.kidsGalaxyTraitsStretchedToPlanet = true;
  if (explicitBody) {
    data.kidsGalaxyExplicitBodyArtwork = true;
    data.kidsGalaxyExplicitBodyPatchCount = components.length;
    data.kidsGalaxyBodyColorInferenceDisabled = true;
    data.designProjection = 'explicit-body-preserved-kid-traits-across-planet';
  } else {
    data.designProjection = 'stretched-preserved-kid-components-with-full-size-back-echo';
  }
  return true;
}

/** Replace alpha-shell accents with actual curved beveled 3D pieces. */
export function installSculptedArtworkGeometry() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxySculptedArtworkGeometry) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function sculptedGeometryTexture(texture) {
    const sourceImage = texture?.image;
    let cloneTexture = null;
    if (sourceImage && typeof document !== 'undefined') {
      const size = imageSize(sourceImage);
      if (size.width && size.height) {
        const cloneCanvas = makeCanvas(size.width, size.height);
        const context = cloneCanvas.getContext('2d', { alpha: false });
        if (context) {
          context.fillStyle = this.bodyColor || '#fff';
          context.fillRect(0, 0, size.width, size.height);
          context.drawImage(sourceImage, 0, 0, size.width, size.height);
          cloneTexture = new THREE.CanvasTexture(cloneCanvas);
        }
      }
    }

    previousApplyTexture.call(this, texture);
    if (!this.mesh.material.userData?.kidsGalaxyComponentSurface || !cloneTexture) {
      cloneTexture?.dispose();
      return;
    }
    try {
      buildSculptedArtwork(this, cloneTexture);
    } finally {
      cloneTexture.dispose();
    }
  }

  sculptedGeometryTexture.kidsGalaxySculptedArtworkGeometry = true;
  PlanetEntity.prototype.applyTexture = sculptedGeometryTexture;
}
