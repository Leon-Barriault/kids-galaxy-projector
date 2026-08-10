import * as THREE from 'three';

import { PlanetEntity } from './PlanetEntity.js';

const EDGE_DILATION = 4;
const RELIEF_CAP = 14;

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

function imageDataFrom(image) {
  const source = canvas(image.width, image.height);
  const context = source.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) return null;
  context.clearRect(0, 0, source.width, source.height);
  context.drawImage(image, 0, 0, source.width, source.height);
  return {
    canvas: source,
    context,
    image: context.getImageData(0, 0, source.width, source.height),
  };
}

function maskValues(imageData) {
  const values = new Uint8Array(imageData.width * imageData.height);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = imageData.data[index * 4];
  }
  return values;
}

function maximumFilter(source, width, height, radius) {
  const horizontal = new Uint8Array(source.length);
  const output = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let maximum = 0;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = (x + dx + width) % width;
        maximum = Math.max(maximum, source[y * width + nx]);
      }
      horizontal[y * width + x] = maximum;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let maximum = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        maximum = Math.max(maximum, horizontal[ny * width + x]);
      }
      output[y * width + x] = maximum;
    }
  }
  return output;
}

function canvasFromMask(values, width, height) {
  const output = canvas(width, height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return output;
  const image = context.createImageData(width, height);
  values.forEach((value, index) => {
    const pixel = index * 4;
    image.data[pixel] = value;
    image.data[pixel + 1] = value;
    image.data[pixel + 2] = value;
    image.data[pixel + 3] = 255;
  });
  context.putImageData(image, 0, 0);
  return output;
}

function softened(source, blurPixels) {
  const output = canvas(source.width, source.height);
  const context = output.getContext('2d', { alpha: false });
  if (!context) return source;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, output.width, output.height);
  if ('filter' in context) context.filter = `blur(${blurPixels}px)`;
  context.drawImage(source, 0, 0);
  if ('filter' in context) context.filter = 'none';
  return output;
}

function chamferDistance(mask, width, height) {
  const infinity = 1e6;
  const distance = new Float32Array(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    distance[index] = mask[index] >= 96 ? infinity : 0;
  }

  const at = (x, y) => distance[y * width + x];
  const put = (x, y, value) => {
    distance[y * width + x] = value;
  };
  const diagonal = 1.41421356;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      let value = distance[index];
      if (x > 0) value = Math.min(value, at(x - 1, y) + 1);
      if (y > 0) value = Math.min(value, at(x, y - 1) + 1);
      if (x > 0 && y > 0) value = Math.min(value, at(x - 1, y - 1) + diagonal);
      if (x + 1 < width && y > 0) {
        value = Math.min(value, at(x + 1, y - 1) + diagonal);
      }
      put(x, y, value);
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      let value = distance[index];
      if (x + 1 < width) value = Math.min(value, at(x + 1, y) + 1);
      if (y + 1 < height) value = Math.min(value, at(x, y + 1) + 1);
      if (x + 1 < width && y + 1 < height) {
        value = Math.min(value, at(x + 1, y + 1) + diagonal);
      }
      if (x > 0 && y + 1 < height) {
        value = Math.min(value, at(x - 1, y + 1) + diagonal);
      }
      put(x, y, value);
    }
  }

  const relief = new Uint8Array(mask.length);
  distance.forEach((value, index) => {
    if (mask[index] < 80) {
      relief[index] = 0;
      return;
    }
    const normalized = THREE.MathUtils.clamp(value / RELIEF_CAP, 0, 1);
    // Sine easing gives the molded patch a rounded shoulder and a broad, soft
    // crown rather than the flat plateau produced by a binary displacement map.
    relief[index] = Math.round(Math.sin(normalized * Math.PI * 0.5) * 255);
  });
  return relief;
}

function propagateColours(sourceImage, sourceMask, width, height, radius) {
  const output = new Uint8ClampedArray(sourceImage.data);
  let filled = new Uint8Array(sourceMask.length);
  sourceMask.forEach((value, index) => {
    if (value >= 96) filled[index] = 1;
  });

  for (let pass = 0; pass < radius; pass += 1) {
    const nextFilled = new Uint8Array(filled);
    const next = new Uint8ClampedArray(output);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (filled[index]) continue;
        let donor = -1;
        for (let dy = -1; dy <= 1 && donor < 0; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = (x + dx + width) % width;
            const candidate = ny * width + nx;
            if (filled[candidate]) {
              donor = candidate;
              break;
            }
          }
        }
        if (donor < 0) continue;
        const targetPixel = index * 4;
        const donorPixel = donor * 4;
        next[targetPixel] = output[donorPixel];
        next[targetPixel + 1] = output[donorPixel + 1];
        next[targetPixel + 2] = output[donorPixel + 2];
        next[targetPixel + 3] = 255;
        nextFilled[index] = 1;
      }
    }
    output.set(next);
    filled = nextFilled;
  }

  // A molded sidewall should be a slightly darker version of the child's own
  // colour, never a black contour and never a white halo.
  for (let index = 0; index < filled.length; index += 1) {
    if (!filled[index]) continue;
    const pixel = index * 4;
    output[pixel] = Math.round(output[pixel] * 0.82);
    output[pixel + 1] = Math.round(output[pixel + 1] * 0.82);
    output[pixel + 2] = Math.round(output[pixel + 2] * 0.82);
    output[pixel + 3] = 255;
  }
  return output;
}

function colourCanvas(data, width, height) {
  const output = canvas(width, height);
  const context = output.getContext('2d', { alpha: true });
  if (!context) return output;
  const image = context.createImageData(width, height);
  image.data.set(data);
  context.putImageData(image, 0, 0);
  return output;
}

function textureFrom(source, colorSpace, renderer) {
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function disposeTextures(material, keys) {
  const textures = new Set();
  keys.forEach((key) => {
    if (material?.[key]) textures.add(material[key]);
  });
  textures.forEach((texture) => texture.dispose());
}

function applyMoldedFinish(entity) {
  const topMaterial = entity.accentMesh?.material;
  const edgeMaterial = entity.accentEdgeMesh?.material;
  const maskImage = topMaterial?.alphaMap?.image;
  const colourImage = topMaterial?.map?.image;
  if (!maskImage || !colourImage || !entity.mesh.material.userData?.kidsGalaxyKidDesignProjection) {
    return false;
  }

  const maskSource = imageDataFrom(maskImage);
  const colourSource = imageDataFrom(colourImage);
  if (!maskSource || !colourSource) return false;
  const width = maskSource.image.width;
  const height = maskSource.image.height;
  const sourceMask = maskValues(maskSource.image);
  const edgeMask = maximumFilter(sourceMask, width, height, EDGE_DILATION);
  const relief = chamferDistance(sourceMask, width, height);
  const edgeColours = propagateColours(
    colourSource.image,
    sourceMask,
    width,
    height,
    EDGE_DILATION,
  );

  const renderer = entity.scene.renderer;
  const softTopMask = textureFrom(
    softened(canvasFromMask(sourceMask, width, height), 1.6),
    THREE.NoColorSpace,
    renderer,
  );
  const softEdgeMask = textureFrom(
    softened(canvasFromMask(edgeMask, width, height), 1.8),
    THREE.NoColorSpace,
    renderer,
  );
  const domeRelief = textureFrom(
    softened(canvasFromMask(relief, width, height), 1.1),
    THREE.NoColorSpace,
    renderer,
  );
  const edgeColour = textureFrom(
    colourCanvas(edgeColours, width, height),
    THREE.SRGBColorSpace,
    renderer,
  );

  disposeTextures(edgeMaterial, ['map', 'alphaMap', 'bumpMap', 'displacementMap']);
  disposeTextures(topMaterial, ['alphaMap', 'bumpMap', 'displacementMap']);

  edgeMaterial.map = edgeColour;
  edgeMaterial.alphaMap = softEdgeMask;
  edgeMaterial.bumpMap = domeRelief;
  edgeMaterial.bumpScale = 0.035;
  edgeMaterial.alphaTest = 0.01;
  edgeMaterial.transparent = true;
  edgeMaterial.opacity = 1;
  edgeMaterial.depthWrite = true;
  edgeMaterial.alphaToCoverage = true;
  edgeMaterial.roughness = 0.32;
  edgeMaterial.clearcoat = 0.14;
  edgeMaterial.clearcoatRoughness = 0.44;
  edgeMaterial.userData.kidsGalaxyMoldedKidFinish = true;
  edgeMaterial.userData.kidsGalaxyRoundedSameHueShoulder = true;
  edgeMaterial.needsUpdate = true;

  topMaterial.alphaMap = softTopMask;
  topMaterial.bumpMap = domeRelief;
  topMaterial.bumpScale = 0.11;
  topMaterial.displacementMap = domeRelief;
  topMaterial.displacementScale = 0.045;
  topMaterial.displacementBias = -0.003;
  topMaterial.alphaTest = 0.01;
  topMaterial.transparent = true;
  topMaterial.opacity = 1;
  topMaterial.depthWrite = true;
  topMaterial.alphaToCoverage = true;
  topMaterial.roughness = 0.22;
  topMaterial.clearcoat = 0.24;
  topMaterial.clearcoatRoughness = 0.3;
  topMaterial.userData.kidsGalaxyMoldedKidFinish = true;
  topMaterial.userData.kidsGalaxyDomedKidTop = true;
  topMaterial.needsUpdate = true;

  entity.mesh.material.userData.kidsGalaxyMoldedKidFinish = true;
  entity.mesh.material.userData.kidsGalaxyMoldedShoulderPixels = EDGE_DILATION;
  entity.mesh.material.userData.kidsGalaxyMoldedReliefCap = RELIEF_CAP;
  return true;
}

/**
 * Final visual pass for kid artwork: real same-hue shoulder + domed relief.
 * This intentionally runs after motif projection and presentation alignment.
 */
export function installKidArtworkMoldedFinish() {
  if (PlanetEntity.prototype.applyTexture?.kidsGalaxyMoldedKidFinish) return;
  const previousApplyTexture = PlanetEntity.prototype.applyTexture;

  function moldedKidArtwork(texture) {
    previousApplyTexture.call(this, texture);
    try {
      applyMoldedFinish(this);
    } catch (_error) {
      // The preceding motif renderer remains a complete fallback.
    }
  }

  moldedKidArtwork.kidsGalaxyMoldedKidFinish = true;
  PlanetEntity.prototype.applyTexture = moldedKidArtwork;
}
