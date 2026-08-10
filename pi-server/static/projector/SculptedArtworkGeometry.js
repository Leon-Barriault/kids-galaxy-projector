import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const DISC_SIZE = 256;
const GRID = 128;
const MAX_COLORS = 3;
const MAX_COMPONENTS = 7;
const MIN_COMPONENT_CELLS = 14;
const BASE_RADIUS = 1.056;
const SHOULDER_RADIUS = 1.079;
const TOP_RADIUS = 1.107;

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

function whiteDistance(r, g, b) {
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
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

function recoverDisc(texture) {
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
  if (legacy) return recoverLegacy(source);

  const disc = makeCanvas(DISC_SIZE, DISC_SIZE);
  const discContext = disc.getContext('2d', { alpha: false });
  if (!discContext) return null;
  discContext.fillStyle = '#fff';
  discContext.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  discContext.imageSmoothingEnabled = true;
  discContext.drawImage(source, 0, 0, DISC_SIZE, DISC_SIZE);
  return disc;
}

function indexOf(x, y) {
  return y * GRID + x;
}

function analyse(texture) {
  const disc = recoverDisc(texture);
  if (!disc) return null;
  const sample = makeCanvas(GRID, GRID);
  const context = sample.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#fff';
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
      if (whiteDistance(r, g, b) < 0.08) continue;
      const colour = paletteIndex(r, g, b);
      labels[indexOf(x, y)] = colour;
      counts[colour] += 1;
      sums[colour][0] += r;
      sums[colour][1] += g;
      sums[colour][2] += b;
    }
  }

  let dominant = 0;
  counts.forEach((count, index) => {
    if (count > counts[dominant]) dominant = index;
  });
  let accentColours = counts
    .map((count, index) => ({ count, index }))
    .filter(({ count, index }) => count >= Math.max(10, inside * 0.002) && index !== dominant)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_COLORS)
    .map(({ index }) => index);
  if (!accentColours.length && counts[dominant]) accentColours = [dominant];

  const colours = new Map();
  accentColours.forEach((colour) => {
    const count = Math.max(1, counts[colour]);
    colours.set(
      colour,
      new THREE.Color().setRGB(
        sums[colour][0] / count / 255,
        sums[colour][1] / count / 255,
        sums[colour][2] / count / 255,
        THREE.SRGBColorSpace,
      ),
    );
  });

  return { labels, accentColours, colours, inside };
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
      if (cells.length >= MIN_COMPONENT_CELLS) components.push({ colour, cells });
    }
  }

  return components.sort((a, b) => b.cells.length - a.cells.length).slice(0, MAX_COMPONENTS);
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

function createPatchGeometry(contour, colour, { back = false, backRotation = 0, scale = 1 } = {}) {
  const centre = centroid(contour);
  const outer = scaledContour(contour, 1.035 * scale, centre);
  const shoulder = scaledContour(contour, 0.985 * scale, centre);
  const top = scaledContour(contour, 0.92 * scale, centre);
  const rings = [
    { points: outer, radius: BASE_RADIUS, colour: colour.clone().offsetHSL(0, -0.01, -0.13) },
    { points: shoulder, radius: SHOULDER_RADIUS, colour: colour.clone().offsetHSL(0, -0.005, -0.055) },
    { points: top, radius: TOP_RADIUS, colour: colour.clone().offsetHSL(0, 0.012, 0.045) },
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
  geometry.userData.kidsGalaxyPatchVertexCount = positions.length / 3;
  geometry.userData.kidsGalaxyPatchRelief = TOP_RADIUS - BODY_RADIUS;
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

function buildSculptedArtwork(entity, texture) {
  const analysis = analyse(texture);
  if (!analysis) return false;
  const components = componentsFor(analysis)
    .map((component) => ({ ...component, contour: componentContour(component) }))
    .filter((component) => component.contour?.length >= 6);
  if (!components.length) return false;

  disposeGroup(entity.sculptedArtworkGroup);
  const group = new THREE.Group();
  group.userData.kidsGalaxySculptedArtworkGroup = true;
  group.userData.componentCount = components.length;

  const seed = entity.animator.hashId(`${entity.id}-sculpted-back-echo`);
  const backRotation = 0.18 + entity.seededUnit(seed, 5) * 0.28;
  components.forEach((component, index) => {
    const colour = analysis.colours.get(component.colour) || new THREE.Color(0xffffff);
    const mesh = new THREE.Mesh(createPatchGeometry(component.contour, colour), patchMaterial());
    mesh.userData.kidsGalaxySculptedKidPatch = true;
    mesh.userData.kidsGalaxyKidPatchIndex = index;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // A smaller opposite-side echo gives a complete designed planet without
    // asking a child to paint invisible faces of the sphere.
    if (index < 4) {
      const back = new THREE.Mesh(
        createPatchGeometry(component.contour, colour, {
          back: true,
          backRotation,
          scale: 0.82,
        }),
        patchMaterial(),
      );
      back.userData.kidsGalaxySculptedKidPatch = true;
      back.userData.kidsGalaxyBackDesignEcho = true;
      back.castShadow = true;
      back.receiveShadow = true;
      group.add(back);
    }
  });

  entity.mesh.add(group);
  entity.sculptedArtworkGroup = group;
  entity.accentEdgeMesh.visible = false;
  entity.accentMesh.visible = false;
  entity.mesh.material.userData.kidsGalaxyTrueSculptedArtwork = true;
  entity.mesh.material.userData.kidsGalaxySculptedPatchCount = components.length;
  entity.mesh.material.userData.kidsGalaxySculptedBackEchoCount = Math.min(4, components.length);
  entity.mesh.material.userData.designProjection = 'true-beveled-kid-components-with-back-echo';
  return true;
}

/** Replace alpha-shell accents with actual curved beveled 3D pieces. */
export function installSculptedArtworkGeometry() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxySculptedArtworkGeometry) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function sculptedGeometryTexture(texture) {
    // Analyse before the previous renderer disposes its GPU source texture.
    const sourceImage = texture?.image;
    let cloneTexture = null;
    if (sourceImage && typeof document !== 'undefined') {
      const size = imageSize(sourceImage);
      if (size.width && size.height) {
        const cloneCanvas = makeCanvas(size.width, size.height);
        const context = cloneCanvas.getContext('2d', { alpha: false });
        if (context) {
          context.fillStyle = '#fff';
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
