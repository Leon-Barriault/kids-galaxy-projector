import * as THREE from 'three';

/**
 * A studio-in-a-can: one soft key, a broad fill, a back kick and a warm floor
 * bounce, prefiltered into an environment map and shared by every planet.
 *
 * The scene's own rig is two dim ambient lights plus a point light at the sun,
 * which is physically honest and makes a matte ball read as a dark disc with a
 * bright edge - space, not a toy on a shelf. Image-based light is what supplies
 * the gentle wrap-around a painted object needs to look solid.
 *
 * What this replaces was a 64x64 canvas holding a three-stop vertical gradient.
 * Two things were wrong with it. It carried no *shape*: a smooth top-to-bottom
 * ramp has no bright region for a surface to catch, so the broad soft highlight
 * that makes the reference images read as a studio product shot had nothing to
 * come from. And being an 8-bit canvas it could not carry one even in principle
 * - a light source is brighter than white, and in an LDR texture nothing is.
 * This is a float radiance field instead, authored by *direction* rather than by
 * pixel, so the key is placed as a world vector and the equirectangular
 * projection is derived rather than eyeballed in UV space.
 *
 * Total energy is deliberately held: the field is normalised so its
 * solid-angle-weighted mean radiance matches the gradient it replaces. The
 * change on screen is that the light now has a direction and a shape, not that
 * the planets got brighter.
 */

// Measured off the gradient this replaces, integrated over the sphere with
// dOmega = cos(elevation) dElevation dPhi. Holding this constant is what keeps
// the change to the *character* of the light rather than its quantity.
const LEGACY_MEAN_LUMINANCE = 0.44776;

// Radiance of the empty studio, before any source is added. Cool sky over a warm
// bounce, the way daylight falls on a table.
const SKY_UP = [0.62, 0.68, 0.82];
const SKY_HORIZON = [0.46, 0.48, 0.55];
const FLOOR = [0.34, 0.28, 0.22];

// The key. Upper-front-left as seen from the default camera, which looks down
// -Z: "front" is +Z, "left" is -X. Wide and soft, because the reference look has
// no pinpoint glint anywhere on it - the highlight is a broad shoulder of light,
// which is what a big softbox close to the subject does and what a punctual
// light fundamentally cannot.
const KEY = {
  direction: [-0.45, 0.72, 0.52],
  radiance: [3.6, 3.45, 3.1],
  coreDegrees: 26,
  edgeDegrees: 58,
};

// A broad, dim, cool fill opposite the key. Stops the shadow side going flat
// dark, which on a near-black space background is the difference between a toy
// and a crescent.
const FILL = {
  direction: [0.75, 0.12, 0.4],
  radiance: [0.55, 0.62, 0.75],
  coreDegrees: 30,
  edgeDegrees: 85,
};

// A back kick to lift the silhouette off the background. The projector renders
// onto near-black, so without this the planet's edge dissolves into the scene
// exactly where the reference look has its brightest rim.
const RIM = {
  direction: [0.15, 0.15, -0.95],
  radiance: [1.1, 1.05, 1.2],
  coreDegrees: 18,
  edgeDegrees: 45,
};

const ENV_WIDTH = 256;
const ENV_HEIGHT = 128;

const luminanceOf = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length > 0 ? vector.map((c) => c / length) : [0, 1, 0];
}

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

// How much a source dims across its own face, centre to core edge. A softbox is
// not a flat disc of constant radiance, and modelling it as one leaves a
// plateau: every direction inside the core is exactly as bright as every other,
// so the brightest point of the sky is decided by whatever the base gradient
// happens to be doing underneath rather than by where the light was aimed. Small
// enough to stay a soft source, large enough to have a middle.
const CORE_TAPER = 0.15;

/**
 * How much of a source reaches a direction: near-full inside the core cone,
 * easing to nothing by the edge cone. Working in degrees off-axis rather than in
 * texels keeps a source the same shape at every latitude, where a gaussian
 * painted into equirectangular UV space would smear towards the poles.
 */
function sourceFalloff(direction, source) {
  const axis = normalize(source.direction);
  const dot = Math.min(1, Math.max(-1, direction[0] * axis[0] + direction[1] * axis[1] + direction[2] * axis[2]));
  const degrees = (Math.acos(dot) * 180) / Math.PI;
  if (degrees >= source.edgeDegrees) return 0;
  const acrossFace = Math.min(1, degrees / source.coreDegrees);
  const centre = 1 - CORE_TAPER * acrossFace * acrossFace;
  if (degrees <= source.coreDegrees) return centre;
  return centre * (1 - smoothstep((degrees - source.coreDegrees) / (source.edgeDegrees - source.coreDegrees)));
}

function baseRadiance(y) {
  if (y >= 0) {
    const t = smoothstep(y);
    return SKY_HORIZON.map((c, i) => c + (SKY_UP[i] - c) * t);
  }
  const t = smoothstep(-y);
  return SKY_HORIZON.map((c, i) => c + (FLOOR[i] - c) * t);
}

/**
 * The radiance field, as a plain Float32Array. Pure and rendererless so the
 * placement of the key can be asserted without a GPU.
 *
 * The direction for a texel is derived from three.js's own equirectangular
 * convention - u = atan2(z, x)/2pi + 0.5, v = asin(y)/pi + 0.5 - inverted. Row
 * zero is the top of the sky because a texture uploaded with flipY set puts the
 * first row at v = 1.
 */
export function buildStudioRadianceField({ width = ENV_WIDTH, height = ENV_HEIGHT } = {}) {
  const data = new Float32Array(width * height * 4);

  let weightedSum = 0;
  let weightTotal = 0;

  for (let row = 0; row < height; row += 1) {
    const v = 1 - (row + 0.5) / height;
    const elevation = (v - 0.5) * Math.PI;
    const y = Math.sin(elevation);
    const horizontal = Math.cos(elevation);
    // Solid angle shrinks towards the poles, so a pole texel must not count as
    // much as an equator one when the field is normalised.
    const weight = horizontal;
    const base = baseRadiance(y);

    for (let column = 0; column < width; column += 1) {
      const u = (column + 0.5) / width;
      const phi = (u - 0.5) * Math.PI * 2;
      const direction = [horizontal * Math.cos(phi), y, horizontal * Math.sin(phi)];

      const key = sourceFalloff(direction, KEY);
      const fill = sourceFalloff(direction, FILL);
      const rim = sourceFalloff(direction, RIM);

      const offset = (row * width + column) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        data[offset + channel] =
          base[channel] +
          KEY.radiance[channel] * key +
          FILL.radiance[channel] * fill +
          RIM.radiance[channel] * rim;
      }
      data[offset + 3] = 1;
      weightedSum += luminanceOf([data[offset], data[offset + 1], data[offset + 2]]) * weight;
      weightTotal += weight;
    }
  }

  const mean = weightTotal > 0 ? weightedSum / weightTotal : 1;
  const scale = mean > 0 ? LEGACY_MEAN_LUMINANCE / mean : 1;
  for (let i = 0; i < data.length; i += 4) {
    data[i] *= scale;
    data[i + 1] *= scale;
    data[i + 2] *= scale;
  }

  return { data, width, height, scale };
}

let sharedEnvironment = null;

export function studioEnvironment(renderer) {
  if (sharedEnvironment || !renderer) return sharedEnvironment;
  if (typeof THREE.DataTexture !== 'function') return null;

  const field = buildStudioRadianceField();
  const source = new THREE.DataTexture(
    field.data,
    field.width,
    field.height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  source.mapping = THREE.EquirectangularReflectionMapping;
  // The field is already linear radiance, so it must not be decoded again.
  source.colorSpace = THREE.LinearSRGBColorSpace;
  // DataTexture defaults to NearestFilter, which would band a 256x128 sky into
  // visible steps before the prefilter ever got to it.
  source.minFilter = THREE.LinearFilter;
  source.magFilter = THREE.LinearFilter;
  source.needsUpdate = true;

  // Prefiltering renders into its own targets, so it moves the renderer's
  // target, viewport and scissor out from under whatever set them. This
  // projector scales its internal resolution, so those are not defaults to be
  // restored by luck - leaving them changed means every later frame draws into
  // the wrong rectangle.
  const previousTarget = renderer.getRenderTarget();
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  try {
    const generator = new THREE.PMREMGenerator(renderer);
    generator.compileEquirectangularShader();
    sharedEnvironment = generator.fromEquirectangular(source).texture;
    generator.dispose();
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    source.dispose();
  }
  return sharedEnvironment;
}

export const STUDIO_SOURCES = Object.freeze({ KEY, FILL, RIM, LEGACY_MEAN_LUMINANCE });
