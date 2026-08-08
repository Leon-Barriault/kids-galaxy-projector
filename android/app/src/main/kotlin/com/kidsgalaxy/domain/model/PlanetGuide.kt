package com.kidsgalaxy.domain.model

import kotlin.math.min

/**
 * Fixed circle guide painted on the drawing surface.
 *
 * Derived from [CanvasSize], never stored as a stroke — undo/clear must not
 * remove it, and it must not make `canLaunch` true on its own. Anything drawn
 * outside the rim is ignored by the renderer; the boundary is what makes the
 * polar sphere mapping well-defined.
 *
 * Pure domain type: no `android.*` / `androidx.*` imports.
 */
data class PlanetGuide(
    val centreX: Float,
    val centreY: Float,
    val radius: Float,
) {
    /** True when the guide has a positive radius (canvas was measured). */
    val isValid: Boolean get() = radius > 0f

    /** Inclusive on the rim so strokes on the outline still colour the planet. */
    fun contains(point: Point): Boolean {
        if (!isValid) return false
        val dx = point.x - centreX
        val dy = point.y - centreY
        return dx * dx + dy * dy <= radius * radius
    }

    companion object {
        /** Fraction of the smaller canvas edge used as radius (~fits with margin). */
        const val RADIUS_FRACTION = 0.42f

        /**
         * Builds a centred guide for [size].
         *
         * Unmeasured canvases produce a degenerate guide (radius 0) so callers can
         * detect the condition instead of dividing by zero or crashing.
         */
        fun forCanvas(size: CanvasSize): PlanetGuide {
            if (!size.isMeasured) {
                return PlanetGuide(centreX = 0f, centreY = 0f, radius = 0f)
            }
            val radius = RADIUS_FRACTION * min(size.width, size.height)
            return PlanetGuide(
                centreX = size.width / 2f,
                centreY = size.height / 2f,
                radius = radius,
            )
        }
    }
}
