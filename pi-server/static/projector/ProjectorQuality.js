export const MAX_INTERNAL_WIDTH = 1920;
export const MAX_INTERNAL_HEIGHT = 1080;
export const MAX_DEVICE_PIXEL_RATIO = 1;
export const MIN_RENDER_SCALE = 0.25;

/**
 * Keep the browser canvas full-screen while bounding the actual WebGL buffer.
 *
 * A Pi can happily negotiate a 4K HDMI mode, but rendering this scene at 4K
 * would quadruple fragment work for very little visible benefit on a wall.
 * The browser/projector performs the final upscale instead.
 */
export function renderPixelRatioForViewport(
  width,
  height,
  devicePixelRatio = 1,
) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  return Math.max(
    MIN_RENDER_SCALE,
    Math.min(
      devicePixelRatio || 1,
      MAX_DEVICE_PIXEL_RATIO,
      MAX_INTERNAL_WIDTH / safeWidth,
      MAX_INTERNAL_HEIGHT / safeHeight,
    ),
  );
}

export function applyPiRenderBudget(
  renderer,
  width,
  height,
  devicePixelRatio = 1,
) {
  const pixelRatio = renderPixelRatioForViewport(width, height, devicePixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);

  // WebGLRenderer is not an Object3D and therefore does not receive Three's
  // usual userData bag. Create our own lightweight diagnostics container.
  renderer.userData ??= {};
  renderer.userData.kidsGalaxyRenderScale = pixelRatio;
  renderer.userData.kidsGalaxyInternalWidth = Math.round(width * pixelRatio);
  renderer.userData.kidsGalaxyInternalHeight = Math.round(height * pixelRatio);
  return pixelRatio;
}
