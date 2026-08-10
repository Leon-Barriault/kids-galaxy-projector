import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const DISC_SIZE = 256;
const GRID = 128;
const TARGET_SPAN = 1.78;
const MAX_COMPONENTS = 9;
const MIN_COMPONENT_CELLS = 8;
const BODY_MATCH_DISTANCE = 46;
const BODY_RADIUS = 1.05;
const FRONT_LIMIT = 0.92;
const BACK_ROTATION = 0.42;
const CAP_SUBDIVISIONS = 1;

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

function nearestPalette(rgb) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  PALETTE.forEach((candidate, index) => {
    const distance = rgbDistance(rgb, candidate);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });
  return bestIndex;
}

function captureDisc(texture) {
  if (typeof document === 'undefined' || !texture?.image) return null;
  const size = imageSize(texture.image);
  if (!size.width || !size.height) return null;
  const canvas = makeCanvas(DISC_SIZE, DISC_SIZE);
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(texture.image, 0, 0, DISC_SIZE, DISC_SIZE);
  return canvas;
}

function gridIndex(x, y) {
  return y * GRID + x;
}

function analyse(texture, bodyHex) {
  const bodyRgb = parseHex(bodyHex);
  const disc = captureDisc(texture);
  if (!bodyRgb || !disc) return null;

  const sample = makeCanvas(GRID, GRID);
  const context = sample.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.drawImage(disc, 0, 0, GRID, GRID);
  const pixels = context.getImageData(0, 0, GRID, GRID).data;
  const labels = new Int16Array(GRID * GRID);
  labels.fill(-1);
  const sums = PALETTE.map(() => [0, 0, 0]);
  const counts = new Array(PALETTE.length).fill(0);

  let minX = GRID;
  let minY = GRID;
  let maxX = -1;
  let maxY = -1;
  let authoredCells = 0;

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const nx = ((x + 0.5) / GRID - 0.5) * 2;
      const ny = ((y + 0.5) / GRID - 0.5) * 2;
      if (nx * nx + ny * ny > 0.965 * 0.965) continue;

      const offset = gridIndex(x, y) * 4;
      const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      if (rgbDistance(rgb, bodyRgb) <= BODY_MATCH_DISTANCE) continue;

      const palette = nearestPalette(rgb);
      // A brush stroke that is effectively the bucket colour is intentionally
      // absorbed into the body, even if antialiasing moved a few edge pixels.
      if (rgbDistance(PALETTE[palette], bodyRgb) <= BODY_MATCH_DISTANCE) continue;

      labels[gridIndex(x, y)] = palette;
      sums[palette][0] += rgb[0];
      sums[palette][1] += rgb[1];
      sums[palette][2] += rgb[2];
      counts[palette] += 1;
      authoredCells += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!authoredCells) {
    return {
      labels,
      colours: new Map(),
      bounds: null,
      authoredCells: 0,
    };
  }

  const colours = new Map();
  counts.forEach((count, index) => {
    if (!count) return;
    colours.set(
      index,
      new THREE.Color().setRGB(
        sums[index][0] / count / 255,
        sums[index][1] / count / 255,
        sums[index][2] / count / 255,
        THREE.SRGBColorSpace,
      ),
    );
  });

  return {
    labels,
    colours,
    authoredCells,
    bounds: { minX, minY, maxX, maxY },
  };
}

function componentsFor(analysis) {
  if (!analysis?.bounds) return [];
  const visited = new Uint8Array(GRID * GRID);
  const neighbours = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const components = [];

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const start = gridIndex(x, y);
      const colour = analysis.labels[start];
      if (colour < 0 || visited[start]) continue;
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
          const next = gridIndex(nx, ny);
          if (visited[next] || analysis.labels[next] !== colour) return;
          visited[next] = 1;
          queue.push(next);
        });
      }
      if (cells.length >= MIN_COMPONENT_CELLS) components.push({ colour, cells });
    }
  }

  return components
    .sort((a, b) => b.cells.length - a.cells.length)
    .slice(0, MAX_COMPONENTS);
}

function contourEdges(component) {
  const occupied = new Set(component.cells);
  const edges = [];
  component.cells.forEach((cell) => {
    const y = Math.floor(cell / GRID);
    const x = cell % GRID;
    if (y === 0 || !occupied.has(gridIndex(x, y - 1))) edges.push([[x, y], [x + 1, y]]);
    if (x === GRID - 1 || !occupied.has(gridIndex(x + 1, y))) {
      edges.push([[x + 1, y], [x + 1, y + 1]]);
    }
    if (y === GRID - 1 || !occupied.has(gridIndex(x, y + 1))) {
      edges.push([[x + 1, y + 1], [x, y + 1]]);
    }
    if (x === 0 || !occupied.has(gridIndex(x - 1, y))) edges.push([[x, y + 1], [x, y]]);
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
    while (current && pointKey(current) !== startKey && guard < edges.length + 8) {
      loop.push(current);
      const key = pointKey(current);
      const next = outgoing.get(key);
      if (!next?.length) break;
      current = next.pop();
      if (!next.length) outgoing.delete(key);
      guard += 1;
    }
    if (current && pointKey(current) === startKey && loop.length >= 6) loops.push(loop);
  }
  return loops;
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function chaikin(points, iterations = 2) {
  let output = points;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = [];
    for (let index = 0; index < output.length; index += 1) {
      const a = output[index];
      const b = output[(index + 1) % output.length];
      next.push(new THREE.Vector2(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      next.push(new THREE.Vector2(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    output = next;
  }
  return output;
}

function decimate(points, maximum = 112) {
  if (points.length <= maximum) return points;
  const step = points.length / maximum;
  const output = [];
  for (let cursor = 0; cursor < points.length; cursor += step) {
    output.push(points[Math.floor(cursor) % points.length]);
  }
  return output;
}

function mappedPoint(x, y, bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX + 1);
  const height = Math.max(1, bounds.maxY - bounds.minY + 1);
  return new THREE.Vector2(
    ((x - bounds.minX) / width - 0.5) * TARGET_SPAN,
    (0.5 - (y - bounds.minY) / height) * TARGET_SPAN,
  );
}

function componentContour(component, bounds) {
  const loops = loopsFromEdges(contourEdges(component));
  if (!loops.length) return null;
  const candidates = loops.map((loop) => {
    const points = loop.map(([x, y]) => mappedPoint(x, y, bounds));
    if (polygonArea(points) < 0) points.reverse();
    return points;
  });
  candidates.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return decimate(chaikin(candidates[0], 2));
}

function centroid(points) {
  const centre = new THREE.Vector2();
  points.forEach((point) => centre.add(point));
  return centre.multiplyScalar(1 / Math.max(1, points.length));
}

function scaledContour(points, scale, centre) {
  return points.map((point) => centre.clone().add(point.clone().sub(centre).multiplyScalar(scale)));
}

function spherePoint(point, radius, back = false) {
  let x = point.x;
  let y = point.y;
  const length = Math.hypot(x, y);
  if (length > FRONT_LIMIT) {
    const factor = FRONT_LIMIT / length;
    x *= factor;
    y *= factor;
  }
  const z = Math.sqrt(Math.max(0.02, 1 - x * x - y * y));
  const vector = new THREE.Vector3(x, y, back ? -z : z).normalize();
  if (back) vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), BACK_ROTATION);
  return vector.multiplyScalar(radius);
}

function pushTriangle(a, b, c, positions, indices) {
  const start = positions.length / 3;
  [a, b, c].forEach((vertex) => positions.push(vertex.x, vertex.y, vertex.z));
  const normal = b.clone().sub(a).cross(c.clone().sub(a));
  const centre = a.clone().add(b).add(c).multiplyScalar(1 / 3);
  if (normal.dot(centre) >= 0) indices.push(start, start + 1, start + 2);
  else indices.push(start, start + 2, start + 1);
}

function curvedTriangle(a, b, c, depth, radius, back, positions, indices) {
  if (depth <= 0) {
    pushTriangle(
      spherePoint(a, radius, back),
      spherePoint(b, radius, back),
      spherePoint(c, radius, back),
      positions,
      indices,
    );
    return;
  }
  const ab = a.clone().add(b).multiplyScalar(0.5);
  const bc = b.clone().add(c).multiplyScalar(0.5);
  const ca = c.clone().add(a).multiplyScalar(0.5);
  curvedTriangle(a, ab, ca, depth - 1, radius, back, positions, indices);
  curvedTriangle(ab, b, bc, depth - 1, radius, back, positions, indices);
  curvedTriangle(ca, bc, c, depth - 1, radius, back, positions, indices);
  curvedTriangle(ab, bc, ca, depth - 1, radius, back, positions, indices);
}

function makePatchGeometry(contour, colour, back = false) {
  const centre = centroid(contour);
  const profiles = [
    { scale: 1.035, radius: 1.052, lightness: -0.105 },
    { scale: 1.005, radius: 1.061, lightness: -0.070 },
    { scale: 0.975, radius: 1.075, lightness: -0.035 },
    { scale: 0.950, radius: 1.091, lightness: 0.010 },
    { scale: 0.930, radius: 1.101, lightness: 0.030 },
  ];

  const positions = [];
  const colours = [];
  const rings = profiles.map((profile) => ({
    ...profile,
    points: scaledContour(contour, profile.scale * (back ? 0.96 : 1), centre),
    colour: colour.clone().offsetHSL(0, 0, profile.lightness),
  }));

  rings.forEach((ring) => {
    ring.points.forEach((point) => {
      const vertex = spherePoint(point, ring.radius, back);
      positions.push(vertex.x, vertex.y, vertex.z);
      colours.push(ring.colour.r, ring.colour.g, ring.colour.b);
    });
  });

  const ringSize = contour.length;
  const indices = [];
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const current = ringIndex * ringSize;
    const next = (ringIndex + 1) * ringSize;
    for (let index = 0; index < ringSize; index += 1) {
      const following = (index + 1) % ringSize;
      const a = current + index;
      const b = next + index;
      const c = current + following;
      const d = next + following;
      if (!back) indices.push(a, b, c, c, b, d);
      else indices.push(a, c, b, c, d, b);
    }
  }

  const top = rings[rings.length - 1];
  const triangles = THREE.ShapeUtils.triangulateShape(top.points, []);
  const capPositions = [];
  const capIndices = [];
  triangles.forEach(([a, b, c]) => {
    curvedTriangle(
      top.points[a],
      top.points[b],
      top.points[c],
      CAP_SUBDIVISIONS,
      top.radius,
      back,
      capPositions,
      capIndices,
    );
  });
  const capOffset = positions.length / 3;
  positions.push(...capPositions);
  const topColour = top.colour;
  for (let index = 0; index < capPositions.length / 3; index += 1) {
    colours.push(topColour.r, topColour.g, topColour.b);
  }
  capIndices.forEach((index) => indices.push(index + capOffset));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const position = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const radial = new THREE.Vector3();
  const geometric = new THREE.Vector3();
  const blended = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    radial.fromBufferAttribute(position, index).normalize();
    geometric.fromBufferAttribute(normals, index).normalize();
    blended.copy(geometric).multiplyScalar(0.35).addScaledVector(radial, 0.65).normalize();
    normals.setXYZ(index, blended.x, blended.y, blended.z);
  }
  normals.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.userData.kidsGalaxySculptedKidPatch = true;
  geometry.userData.kidsGalaxyExplicitBodyPatch = true;
  geometry.userData.kidsGalaxyRoundedSlab = true;
  geometry.userData.kidsGalaxyBeveledKidPatch = true;
  geometry.userData.kidsGalaxyPatchRelief = profiles.at(-1).radius - BODY_RADIUS;
  geometry.userData.kidsGalaxyPatchBackEcho = back;
  return geometry;
}

function patchMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.48,
    metalness: 0.001,
    clearcoat: 0.055,
    clearcoatRoughness: 0.68,
    side: THREE.FrontSide,
  });
}

function disposeGroup(group) {
  if (!group) return;
  group.parent?.remove(group);
  group.traverse((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
}

function rebuildExplicitArtwork(entity, texture) {
  if (!entity.bodyColor) return false;
  const analysis = analyse(texture, entity.bodyColor);
  if (!analysis) return false;

  const components = componentsFor(analysis)
    .map((component) => ({
      ...component,
      contour: componentContour(component, analysis.bounds),
    }))
    .filter((component) => component.contour?.length >= 6);

  disposeGroup(entity.sculptedArtworkGroup);
  const group = new THREE.Group();
  group.userData.kidsGalaxySculptedArtworkGroup = true;
  group.userData.kidsGalaxyExplicitBodyArtwork = true;
  group.userData.kidsGalaxyBodyColor = entity.bodyColor;
  group.userData.kidsGalaxyArtworkTargetSpan = TARGET_SPAN;
  group.userData.kidsGalaxyAuthoredCellCount = analysis.authoredCells;
  group.userData.componentCount = components.length;

  components.forEach((component, index) => {
    const colour = analysis.colours.get(component.colour) || new THREE.Color(0xffffff);
    const front = new THREE.Mesh(makePatchGeometry(component.contour, colour, false), patchMaterial());
    front.userData.kidsGalaxySculptedKidPatch = true;
    front.userData.kidsGalaxyExplicitBodyPatch = true;
    front.userData.kidsGalaxyKidPatchIndex = index;
    front.castShadow = true;
    front.receiveShadow = true;
    group.add(front);

    const back = new THREE.Mesh(makePatchGeometry(component.contour, colour, true), patchMaterial());
    back.userData.kidsGalaxySculptedKidPatch = true;
    back.userData.kidsGalaxyExplicitBodyPatch = true;
    back.userData.kidsGalaxyBackDesignEcho = true;
    back.userData.kidsGalaxyKidPatchIndex = index;
    back.castShadow = true;
    back.receiveShadow = true;
    group.add(back);
  });

  entity.mesh.add(group);
  entity.sculptedArtworkGroup = group;
  entity.accentEdgeMesh.visible = false;
  entity.accentMesh.visible = false;
  const data = entity.mesh.material.userData;
  data.kidsGalaxyTrueSculptedArtwork = true;
  data.kidsGalaxyExplicitBodyArtwork = true;
  data.kidsGalaxyExplicitBodyPatchCount = components.length;
  data.kidsGalaxyTraitsStretchedToPlanet = true;
  data.kidsGalaxyArtworkTargetSpan = TARGET_SPAN;
  data.designProjection = 'explicit-body-preserved-kid-traits-across-planet';
  return true;
}

/**
 * New-tablet path: extract artwork relative to the explicit bucket colour,
 * never by guessing which painted colour ought to be the planet body.
 */
export function installExplicitBodyArtwork() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyExplicitBodyArtwork) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function explicitBodyArtworkTexture(texture) {
    let copy = null;
    if (this.bodyColor && texture?.image && typeof document !== 'undefined') {
      const size = imageSize(texture.image);
      if (size.width && size.height) {
        const canvas = makeCanvas(size.width, size.height);
        const context = canvas.getContext('2d', { alpha: false });
        if (context) {
          context.fillStyle = '#fff';
          context.fillRect(0, 0, size.width, size.height);
          context.drawImage(texture.image, 0, 0, size.width, size.height);
          copy = new THREE.CanvasTexture(canvas);
        }
      }
    }

    previousApplyTexture.call(this, texture);
    if (!copy) return;
    try {
      rebuildExplicitArtwork(this, copy);
    } finally {
      copy.dispose();
    }
  }

  explicitBodyArtworkTexture.kidsGalaxyExplicitBodyArtwork = true;
  PlanetEntity.prototype.applyTexture = explicitBodyArtworkTexture;
}
