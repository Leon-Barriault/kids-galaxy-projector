import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const DISC_SIZE = 256;
const GRID_SIZE = 144;
const MAP_WIDTH = 512;
const MAP_HEIGHT = 256;
const MAX_ACCENT_COLORS = 3;
const MAX_COMPONENTS = 7;
const MIN_COMPONENT_CELLS = 18;
const BODY_RADIUS = 1.05;
const EDGE_RADIUS = 1.064;
const TOP_RADIUS = 1.082;

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

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

function dimensions(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 0,
  };
}

function distanceFromWhite(r, g, b) {
  const dr = 255 - r;
  const dg = 255 - g;
  const db = 255 - b;
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
}

function nearestPalette(r, g, b) {
  let result = 0;
  let best = Number.POSITIVE_INFINITY;
  PALETTE.forEach((entry, index) => {
    const dr = r - entry[0];
    const dg = g - entry[1];
    const db = b - entry[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance >= best) return;
    best = distance;
    result = index;
  });
  return result;
}

function recoverLegacyDisc(source) {
  const sourceContext = source.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!sourceContext) return null;
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
  const output = canvas(DISC_SIZE, DISC_SIZE);
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
      const destination = (y * DISC_SIZE + x) * 4;
      if (radial > 1) {
        pixels.data[destination] = 255;
        pixels.data[destination + 1] = 255;
        pixels.data[destination + 2] = 255;
        pixels.data[destination + 3] = 255;
        continue;
      }
      let angle = Math.atan2(ny, nx) / (Math.PI * 2);
      if (angle < 0) angle += 1;
      const sx = Math.min(source.width - 1, Math.floor(angle * source.width));
      const sy = Math.min(source.height - 1, Math.floor(radial * source.height));
      const sourceIndex = (sy * source.width + sx) * 4;
      pixels.data[destination] = sourcePixels[sourceIndex];
      pixels.data[destination + 1] = sourcePixels[sourceIndex + 1];
      pixels.data[destination + 2] = sourcePixels[sourceIndex + 2];
      pixels.data[destination + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return output;
}

function recoverDisc(texture) {
  if (typeof document === 'undefined' || !texture?.image) return null;
  const size = dimensions(texture.image);
  if (!size.width || !size.height) return null;
  const legacy = size.width >= size.height * 1.45;
  const source = canvas(legacy ? 512 : DISC_SIZE, legacy ? 256 : DISC_SIZE);
  const context = source.getContext('2d', { alpha: false });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, source.width, source.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(texture.image, 0, 0, source.width, source.height);
  if (legacy) return {
    disc: recoverLegacyDisc(source),
    sourceFormat: 'legacy-polar-equirectangular',
  };

  const output = canvas(DISC_SIZE, DISC_SIZE);
  const outputContext = output.getContext('2d', { alpha: false });
  if (!outputContext) return null;
  outputContext.fillStyle = '#ffffff';
  outputContext.fillRect(0, 0, DISC_SIZE, DISC_SIZE);
  outputContext.imageSmoothingEnabled = true;
  outputContext.drawImage(source, 0, 0, DISC_SIZE, DISC_SIZE);
  return { disc: output, sourceFormat: 'kid-disc' };
}

function indexFor(x, y) {
  return y * GRID_SIZE + x;
}

function dilate(mask) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_SIZE) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= GRID_SIZE) continue;
          if (mask[indexFor(nx, ny)]) {
            on = 1;
            break;
          }
        }
      }
      output[indexFor(x, y)] = on;
    }
  }
  return output;
}

function erode(mask) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      let on = 1;
      for (let dy = -1; dy <= 1 && on; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_SIZE) {
          on = 0;
          break;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= GRID_SIZE || !mask[indexFor(nx, ny)]) {
            on = 0;
            break;
          }
        }
      }
      output[indexFor(x, y)] = on;
    }
  }
  return output;
}

function connectedComponents(mask, paletteIndex) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const neighbours = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const start = indexFor(x, y);
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      const cells = [];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        cells.push(current);
        const cy = Math.floor(current / GRID_SIZE);
        const cx = current % GRID_SIZE;
        neighbours.forEach(([dx, dy]) => {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) return;
          const next = indexFor(nx, ny);
          if (!mask[next] || visited[next]) return;
          visited[next] = 1;
          queue.push(next);
        });
      }
      if (cells.length < MIN_COMPONENT_CELLS) continue;

      let sumX = 0;
      let sumY = 0;
      cells.forEach((cell) => {
        sumX += cell % GRID_SIZE;
        sumY += Math.floor(cell / GRID_SIZE);
      });
      const cx = sumX / cells.length;
      const cy = sumY / cells.length;
      const componentMask = new Uint8Array(mask.length);
      cells.forEach((cell) => {
        componentMask[cell] = 1;
      });
      // Close pinholes inside a brush gesture but never merge separate gestures.
      const cleaned = erode(dilate(componentMask));
      components.push({
        paletteIndex,
        size: cells.length,
        mask: cleaned,
        centreX: ((cx + 0.5) / GRID_SIZE - 0.5) * 2,
        centreY: (0.5 - (cy + 0.5) / GRID_SIZE) * 2,
      });
    }
  }
  return components;
}

function srgbColour(sum, count, fallback) {
  const rgb = count
    ? [sum[0] / count, sum[1] / count, sum[2] / count]
    : fallback;
  return new THREE.Color().setRGB(
    rgb[0] / 255,
    rgb[1] / 255,
    rgb[2] / 255,
    THREE.SRGBColorSpace,
  );
}

function analyseDisc(disc) {
  const grid = canvas(GRID_SIZE, GRID_SIZE);
  const context = grid.getContext('2d', { alpha: false, willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
  context.imageSmoothingEnabled = true;
  context.drawImage(disc, 0, 0, GRID_SIZE, GRID_SIZE);
  const pixels = context.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;

  const labels = new Int16Array(GRID_SIZE * GRID_SIZE);
  labels.fill(-1);
  const counts = new Array(PALETTE.length).fill(0);
  const sums = PALETTE.map(() => [0, 0, 0]);
  let painted = 0;
  let inside = 0;

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const nx = ((x + 0.5) / GRID_SIZE - 0.5) * 2;
      const ny = ((y + 0.5) / GRID_SIZE - 0.5) * 2;
      if (nx * nx + ny * ny > 0.97 * 0.97) continue;
      inside += 1;
      const pixel = indexFor(x, y) * 4;
      const r = pixels[pixel];
      const g = pixels[pixel + 1];
      const b = pixels[pixel + 2];
      if (distanceFromWhite(r, g, b) < 0.08) continue;
      const paletteIndex = nearestPalette(r, g, b);
      labels[indexFor(x, y)] = paletteIndex;
      counts[paletteIndex] += 1;
      sums[paletteIndex][0] += r;
      sums[paletteIndex][1] += g;
      sums[paletteIndex][2] += b;
      painted += 1;
    }
  }

  let dominant = 0;
  counts.forEach((count, index) => {
    if (count > counts[dominant]) dominant = index;
  });
  if (!painted) return null;

  let accentPalettes = counts
    .map((count, index) => ({ count, index }))
    .filter(({ count, index }) => count >= Math.max(10, inside * 0.002) && index !== dominant)
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_ACCENT_COLORS)
    .map(({ index }) => index);
  const selfAccent = accentPalettes.length === 0;
  if (selfAccent) accentPalettes = [dominant];

  const bodyColour = srgbColour(sums[dominant], counts[dominant], PALETTE[dominant]);
  if (selfAccent) bodyColour.offsetHSL(0, -0.015, -0.055);

  const colours = new Map();
  accentPalettes.forEach((paletteIndex) => {
    colours.set(
      paletteIndex,
      srgbColour(sums[paletteIndex], counts[paletteIndex], PALETTE[paletteIndex]),
    );
  });

  let components = [];
  accentPalettes.forEach((paletteIndex) => {
    const mask = new Uint8Array(labels.length);
    labels.forEach((label, index) => {
      if (label === paletteIndex) mask[index] = 1;
    });
    components.push(...connectedComponents(mask, paletteIndex));
  });
  components = components
    .sort((left, right) => right.size - left.size)
    .slice(0, MAX_COMPONENTS)
    .map((component) => {
      const relativeSize = component.size / Math.max(1, inside);
      const scale = THREE.MathUtils.clamp(0.9 + relativeSize * 0.32, 0.89, 0.95);
      const centreLength = Math.hypot(component.centreX, component.centreY);
      const spread = centreLength > 0.03 ? Math.min(1.075, 0.93 / centreLength) : 1;
      return {
        ...component,
        scale,
        displayCentreX: component.centreX * spread,
        displayCentreY: component.centreY * spread,
      };
    });

  return {
    dominant,
    accentPalettes,
    selfAccent,
    bodyColour,
    colours,
    components,
    sourcePaintCoverage: painted / Math.max(1, inside),
  };
}

function sampleComponent(component, x, y) {
  const sourceX = component.centreX + (x - component.displayCentreX) / component.scale;
  const sourceY = component.centreY + (y - component.displayCentreY) / component.scale;
  if (sourceX * sourceX + sourceY * sourceY > 1) return false;
  const gx = Math.round((0.5 + sourceX * 0.5) * (GRID_SIZE - 1));
  const gy = Math.round((0.5 - sourceY * 0.5) * (GRID_SIZE - 1));
  if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return false;
  return Boolean(component.mask[indexFor(gx, gy)]);
}

function colourToSrgbBytes(colour, lightness = 0, saturation = 0) {
  const resolved = colour.clone().offsetHSL(0, saturation, lightness).convertLinearToSRGB();
  return [
    Math.round(THREE.MathUtils.clamp(resolved.r, 0, 1) * 255),
    Math.round(THREE.MathUtils.clamp(resolved.g, 0, 1) * 255),
    Math.round(THREE.MathUtils.clamp(resolved.b, 0, 1) * 255),
  ];
}

function sampleDesign(entity, analysis, x, y, front) {
  let px = x;
  let py = y;
  if (!front) {
    const seed = entity.animator.hashId(`${entity.id}-component-back`);
    const angle = 0.25 + entity.seededUnit(seed, 4) * 0.28;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const mirrored = -px;
    px = (mirrored * cosine - py * sine) * 0.88;
    py = (mirrored * sine + py * cosine) * 0.88;
  }

  for (const component of analysis.components) {
    if (sampleComponent(component, px, py)) return component.paletteIndex;
  }
  return -1;
}

function buildMaps(entity, analysis) {
  const maskCanvas = canvas(MAP_WIDTH, MAP_HEIGHT);
  const topCanvas = canvas(MAP_WIDTH, MAP_HEIGHT);
  const edgeCanvas = canvas(MAP_WIDTH, MAP_HEIGHT);
  const maskContext = maskCanvas.getContext('2d', { alpha: false });
  const topContext = topCanvas.getContext('2d', { alpha: false });
  const edgeContext = edgeCanvas.getContext('2d', { alpha: false });
  if (!maskContext || !topContext || !edgeContext) return null;

  const mask = maskContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const top = topContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const edge = edgeContext.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const bodyRgb = colourToSrgbBytes(analysis.bodyColour, -0.025, -0.01);
  let accentPixels = 0;

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    const v = (y + 0.5) / MAP_HEIGHT;
    const latitude = (0.5 - v) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    const sphereY = Math.sin(latitude);
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const u = (x + 0.5) / MAP_WIDTH;
      const longitude = (u - 0.5) * Math.PI * 2;
      const sphereX = Math.sin(longitude) * cosLatitude;
      const front = Math.cos(longitude) * cosLatitude >= 0;
      const paletteIndex = sampleDesign(entity, analysis, sphereX, sphereY, front);
      const pixel = (y * MAP_WIDTH + x) * 4;

      if (paletteIndex < 0) {
        mask.data[pixel] = 0;
        mask.data[pixel + 1] = 0;
        mask.data[pixel + 2] = 0;
        mask.data[pixel + 3] = 255;
        top.data[pixel] = bodyRgb[0];
        top.data[pixel + 1] = bodyRgb[1];
        top.data[pixel + 2] = bodyRgb[2];
        top.data[pixel + 3] = 255;
        edge.data[pixel] = bodyRgb[0];
        edge.data[pixel + 1] = bodyRgb[1];
        edge.data[pixel + 2] = bodyRgb[2];
        edge.data[pixel + 3] = 255;
        continue;
      }

      accentPixels += 1;
      const source = analysis.colours.get(paletteIndex) || analysis.bodyColour;
      const self = analysis.selfAccent && paletteIndex === analysis.dominant;
      const topRgb = colourToSrgbBytes(source, self ? 0.105 : 0.045, 0.01);
      const edgeRgb = colourToSrgbBytes(source, self ? -0.035 : -0.085, -0.01);
      mask.data[pixel] = 255;
      mask.data[pixel + 1] = 255;
      mask.data[pixel + 2] = 255;
      mask.data[pixel + 3] = 255;
      top.data[pixel] = topRgb[0];
      top.data[pixel + 1] = topRgb[1];
      top.data[pixel + 2] = topRgb[2];
      top.data[pixel + 3] = 255;
      edge.data[pixel] = edgeRgb[0];
      edge.data[pixel + 1] = edgeRgb[1];
      edge.data[pixel + 2] = edgeRgb[2];
      edge.data[pixel + 3] = 255;
    }
  }

  maskContext.putImageData(mask, 0, 0);
  topContext.putImageData(top, 0, 0);
  edgeContext.putImageData(edge, 0, 0);
  return { maskCanvas, topCanvas, edgeCanvas, accentPixels };
}

function blurred(source, pixels) {
  const output = canvas(source.width, source.height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, output.width, output.height);
  if ('filter' in context) context.filter = `blur(${pixels}px)`;
  context.drawImage(source, 0, 0);
  if ('filter' in context) context.filter = 'none';
  return output;
}

function textureFrom(source, colorSpace, renderer) {
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
  // Three.js SphereGeometry faces +Z at u=.25; authored maps have their front at u=.5.
  texture.offset.x = 0.25;
  texture.needsUpdate = true;
  return texture;
}

function disposeMaterialTextures(materials) {
  const textures = new Set();
  materials.forEach((material) => {
    ['map', 'alphaMap', 'bumpMap', 'displacementMap'].forEach((key) => {
      if (material?.[key]) textures.add(material[key]);
    });
  });
  textures.forEach((texture) => texture.dispose());
}

function enableShadows(object) {
  object?.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function applyComponentSurface(entity, sourceTexture) {
  const recovered = recoverDisc(sourceTexture);
  if (!recovered?.disc) return false;
  const analysis = analyseDisc(recovered.disc);
  if (!analysis) return false;
  const maps = buildMaps(entity, analysis);
  if (!maps) return false;

  const renderer = entity.scene.renderer;
  const mask = textureFrom(blurred(maps.maskCanvas, 0.85), THREE.NoColorSpace, renderer);
  const relief = textureFrom(blurred(maps.maskCanvas, 3.1), THREE.NoColorSpace, renderer);
  const topColour = textureFrom(maps.topCanvas, THREE.SRGBColorSpace, renderer);
  const edgeColour = textureFrom(maps.edgeCanvas, THREE.SRGBColorSpace, renderer);
  disposeMaterialTextures([
    entity.mesh.material,
    entity.accentEdgeMesh.material,
    entity.accentMesh.material,
  ]);

  const body = entity.mesh.material;
  body.map = null;
  body.bumpMap = null;
  body.displacementMap = null;
  body.color.copy(analysis.bodyColour);
  body.roughness = 0.58;
  body.metalness = 0.001;
  body.clearcoat = 0.032;
  body.clearcoatRoughness = 0.74;
  body.emissive.setHex(0x000000);
  body.emissiveIntensity = 0;
  body.userData.kidsGalaxyKidDesignProjection = true;
  body.userData.kidsGalaxyComponentSurface = true;
  body.userData.kidsGalaxyReferenceSurface = true;
  body.userData.sourceArtworkFormat = recovered.sourceFormat;
  body.userData.designProjection = 'separate-kid-components-on-front-with-styled-back-echo';
  body.userData.bodyFromChildDrawing = true;
  body.userData.sourcePaintCoverage = analysis.sourcePaintCoverage;
  body.userData.accentCoverage = maps.accentPixels / (MAP_WIDTH * MAP_HEIGHT);
  body.userData.accentColorCount = analysis.accentPalettes.length;
  body.userData.componentCount = analysis.components.length;
  body.userData.kidsGalaxyBodyPalette = analysis.dominant;
  body.needsUpdate = true;

  const edge = entity.accentEdgeMesh.material;
  edge.map = edgeColour;
  edge.alphaMap = mask;
  edge.bumpMap = relief;
  edge.bumpScale = 0.016;
  edge.alphaTest = 0.24;
  edge.color.setHex(0xffffff);
  edge.roughness = 0.57;
  edge.metalness = 0.001;
  edge.clearcoat = 0.028;
  edge.clearcoatRoughness = 0.76;
  edge.transparent = false;
  edge.depthWrite = true;
  edge.userData.kidsGalaxySameHueShoulder = true;
  edge.userData.kidsGalaxyComponentSurface = true;
  edge.needsUpdate = true;

  const top = entity.accentMesh.material;
  top.map = topColour;
  top.alphaMap = mask;
  top.bumpMap = relief;
  top.bumpScale = 0.032;
  top.displacementMap = relief;
  top.displacementScale = 0.009;
  top.displacementBias = -0.0005;
  top.alphaTest = 0.29;
  top.color.setHex(0xffffff);
  top.roughness = 0.5;
  top.metalness = 0.001;
  top.clearcoat = 0.052;
  top.clearcoatRoughness = 0.7;
  top.transparent = false;
  top.depthWrite = true;
  top.emissive.setHex(0x000000);
  top.emissiveIntensity = 0;
  top.userData.kidsGalaxyRoundedMoldedTop = true;
  top.userData.kidsGalaxyPreservesKidGesture = true;
  top.userData.kidsGalaxyComponentSurface = true;
  top.needsUpdate = true;

  const edgeGeometryRadius = entity.accentEdgeMesh.geometry?.parameters?.radius || 1.078;
  const topGeometryRadius = entity.accentMesh.geometry?.parameters?.radius || 1.112;
  entity.accentEdgeMesh.scale.setScalar(EDGE_RADIUS / edgeGeometryRadius);
  entity.accentMesh.scale.setScalar(TOP_RADIUS / topGeometryRadius);
  const hasAccents = analysis.components.length > 0 && maps.accentPixels > 0;
  entity.accentEdgeMesh.visible = hasAccents;
  entity.accentMesh.visible = hasAccents;
  entity.reliefMap = relief;
  entity.accentMask = mask;
  enableShadows(entity.mesh);
  sourceTexture.dispose();
  return true;
}

/**
 * Final artwork renderer: separate child-drawn components stay separate rather
 * than being unioned into one inflated spherical patch. The child's dominant
 * paint owns the body; secondary gestures keep their colours, relative layout
 * and recognizable silhouettes as low-profile rounded molded pieces.
 */
export function installKidArtworkComponentSurface() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyKidArtworkComponentSurface) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function componentSurfaceTexture(texture) {
    if (this.disposed) {
      texture.dispose();
      return;
    }
    try {
      if (applyComponentSurface(this, texture)) return;
    } catch (_error) {
      // Fall through to the previous implementation for malformed/unsupported artwork.
    }
    previousApplyTexture.call(this, texture);
  }

  componentSurfaceTexture.kidsGalaxyKidArtworkComponentSurface = true;
  PlanetEntity.prototype.applyTexture = componentSurfaceTexture;
}
