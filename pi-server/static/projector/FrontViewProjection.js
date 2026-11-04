/**
 * Front-view projection: the disc a child paints in is the face of the planet.
 *
 * The classic manifest renderer reads the tablet canvas as a world map - canvas
 * x/y become longitude/latitude, wide marks are stretched into ribbons round
 * the planet, and the polar twist runs on top. That gives every planet a family
 * resemblance, but a face, a continent or a spot stops looking like itself.
 *
 * This reads the drawing for what it is: a picture of a ball seen from the
 * front. Every sphere texel is looked up straight in the disc (an orthographic
 * read, eased near the rim), and the far side shows the mirror image. Mirroring
 * across the limb is continuous, so there is no seam, and a stripe drawn right
 * across the disc closes into a ring by itself - seen from the equator, a
 * latitude circle projects as a horizontal line - so ribbons survive exactly
 * where the child actually drew one.
 *
 * Pure arithmetic: no three.js, no DOM. The rasterising and the relief stay in
 * ManifestStrokeSurface; this only answers "which disc point does this sphere
 * texel show", so it is checked under plain Node by scripts/js.
 */

export const PLANET_RENDERING_CLASSIC = 'classic';
export const PLANET_RENDERING_FRONT_VIEW = 'front-view';

// PlanetGuide.RADIUS_FRACTION on the kid tablet: the guide circle is centred
// on the canvas with a radius of 0.42 x the shorter canvas edge. The manifest
// carries the canvas size, so the disc is recovered from it rather than sent.
export const GUIDE_RADIUS_FRACTION = 0.42;

// 0 is a pixel-exact front view, but a pure orthographic read stalls at the
// limb: the outermost ring of the drawing is smeared over a wide band when the
// planet turns side-on. Easing toward an equal-angle read removes that
// singularity. Higher values put a visible crease where front and back meet,
// so this sits low.
export const FRONT_VIEW_RIM_EASE = 0.3;

/** Anything the projector does not recognise renders the established way. */
export function normalizePlanetRendering(value) {
  return value === PLANET_RENDERING_FRONT_VIEW
    ? PLANET_RENDERING_FRONT_VIEW
    : PLANET_RENDERING_CLASSIC;
}

/**
 * Equirectangular texel (three.js SphereGeometry layout, u and v in 0..1) to a
 * point on the child's disc, in disc radii with y pointing down like the
 * canvas. Local +Z is the front of the planet; the back is the mirror image.
 */
export function discPointForTexel(u, v, rimEase = FRONT_VIEW_RIM_EASE) {
  const phi = u * 2 * Math.PI;
  const theta = v * Math.PI;
  const x = -Math.cos(phi) * Math.sin(theta);
  const y = Math.cos(theta);
  // Distance from the view axis, identical for a point and its mirror image
  // behind it - which is the whole mirroring rule.
  const r = Math.hypot(x, y);
  if (r < 1e-9) return [0, 0];
  const alpha = Math.asin(Math.min(1, r));
  const rho = (1 - rimEase) * Math.min(1, r) + rimEase * (alpha / (Math.PI / 2));
  return [(x / r) * rho, (-y / r) * rho];
}

/** Canvas size and guide radius recovered from a manifest's `canvas` block. */
export function discGeometryOf(canvas) {
  const width = Number(canvas?.width) > 0 ? Number(canvas.width) : 1;
  const height = Number(canvas?.height) > 0 ? Number(canvas.height) : 1;
  return { width, height, radius: GUIDE_RADIUS_FRACTION * Math.min(width, height) };
}

/** A manifest point (normalised canvas coordinates) to disc radii. */
export function canvasPointToDisc([nx, ny], geometry) {
  return [
    (nx * geometry.width - geometry.width / 2) / geometry.radius,
    (ny * geometry.height - geometry.height / 2) / geometry.radius,
  ];
}

/**
 * A manifest stroke width, normalised to the shorter canvas edge, expressed in
 * disc radii. The guide radius is a fixed fraction of that same edge.
 */
export function strokeWidthInDiscRadii(widthNormalized) {
  return widthNormalized / GUIDE_RADIUS_FRACTION;
}

/**
 * Reverse-map disc-space ownership, colour and coverage onto the sphere layout.
 *
 * Every output texel takes all three from the same source texel, nearest
 * neighbour. That is deliberate: the relief is computed from ownership, and an
 * albedo interpolated across an ownership edge would put the colour edge a
 * fraction of a texel off the bevel wall - the mismatch ManifestStrokeSurface
 * already goes out of its way to avoid.
 */
export function sampleDiscOntoSphere(disc, { width, height, rimEase = FRONT_VIEW_RIM_EASE }) {
  const { size } = disc;
  const owner = new Int32Array(width * height);
  const colour = new Uint8ClampedArray(width * height * 3);
  const coverage = new Float32Array(width * height);
  const toTexel = (value) =>
    Math.min(size - 1, Math.max(0, Math.floor((value * 0.5 + 0.5) * size)));
  for (let v = 0; v < height; v += 1) {
    for (let u = 0; u < width; u += 1) {
      const [dx, dy] = discPointForTexel((u + 0.5) / width, (v + 0.5) / height, rimEase);
      const source = toTexel(dy) * size + toTexel(dx);
      const target = v * width + u;
      owner[target] = disc.owner[source];
      colour[target * 3] = disc.colour[source * 3];
      colour[target * 3 + 1] = disc.colour[source * 3 + 1];
      colour[target * 3 + 2] = disc.colour[source * 3 + 2];
      coverage[target] = disc.coverage[source];
    }
  }
  return { owner, colour, coverage };
}
