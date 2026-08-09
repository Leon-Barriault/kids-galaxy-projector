export const MAX_INTERNAL_WIDTH = 3840;
export const MAX_INTERNAL_HEIGHT = 2160;
export const MAX_DEVICE_PIXEL_RATIO = 2;
export const MIN_RENDER_SCALE = 0.5;

/**
 * Keep the browser canvas full-screen while allowing a modern laptop GPU to
 * render at native projector resolution, including 4K when the display and GPU
 * support it. The cap protects against pathological browser DPR values rather
 * than enforcing a low-power device budget.
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

export function applyDesktopRenderBudget(
  renderer,
  width,
  height,
  devicePixelRatio = 1,
) {
  const pixelRatio = renderPixelRatioForViewport(width, height, devicePixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);

  renderer.userData ??= {};
  renderer.userData.kidsGalaxyQualityProfile = 'laptop-high';
  renderer.userData.kidsGalaxyRenderScale = pixelRatio;
  renderer.userData.kidsGalaxyInternalWidth = Math.round(width * pixelRatio);
  renderer.userData.kidsGalaxyInternalHeight = Math.round(height * pixelRatio);
  return pixelRatio;
}

// Transitional alias for modules updated in a later cleanup pass. It now uses
// the laptop/desktop quality profile; there is no Raspberry Pi render cap.
export const applyPiRenderBudget = applyDesktopRenderBudget;
