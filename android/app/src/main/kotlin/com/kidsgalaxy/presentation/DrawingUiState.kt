package com.kidsgalaxy.presentation

import com.kidsgalaxy.domain.model.DEFAULT_CRATER_COLOR_ARGB
import com.kidsgalaxy.domain.model.DEFAULT_MOUNTAIN_COLOR_ARGB
import com.kidsgalaxy.domain.model.DEFAULT_RING_COLOR_ARGB
import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetCompanion
import com.kidsgalaxy.domain.model.PlanetDesign
import com.kidsgalaxy.domain.model.PlanetStyle

/**
 * Immutable UI state for the kid planet-creation screen.
 *
 * Everything the Compose UI needs to render is derived from this single
 * data class. The ViewModel is the only writer; the UI only observes the
 * [StateFlow] exposed by [DrawingViewModel].
 *
 * Design choices are kept here (rather than only inside [Drawing]) so the
 * child can change style, companions and feature colours without losing the
 * strokes they have already drawn.
 */
data class DrawingUiState(
    /** Current strokes and canvas size. */
    val drawing: Drawing = Drawing(),
    /** Selected visual style for the planet. */
    val planetStyle: PlanetStyle = PlanetStyle.CLASSIC,
    /** Companions that will orbit the planet. */
    val companions: Set<PlanetCompanion> = emptySet(),
    /** ARGB colour of the ring when style is RINGED. */
    val ringColorArgb: Int = DEFAULT_RING_COLOR_ARGB,
    /** ARGB colour of crater interiors when style is CRATERED. */
    val craterColorArgb: Int = DEFAULT_CRATER_COLOR_ARGB,
    /** ARGB colour of mountain peaks when style is SPIKY. */
    val mountainColorArgb: Int = DEFAULT_MOUNTAIN_COLOR_ARGB,
    /** Colour currently selected in the drawing palette. */
    val currentColorArgb: Int = DEFAULT_COLOR_ARGB,
    /** Brush width currently selected. */
    val currentStrokeWidth: Float = DEFAULT_STROKE_WIDTH,
    /** True while a send request is in flight. */
    val isSending: Boolean = false,
    /** User-visible error message, or null when there is none. */
    val errorMessage: String? = null,
    /** True after a successful send so the UI can show a celebration. */
    val showSuccess: Boolean = false,
) {
    /** Whether the Undo button should be enabled. */
    val canUndo: Boolean get() = !drawing.isEmpty

    /** Whether the Launch button should be enabled. */
    val canLaunch: Boolean get() = !drawing.isEmpty && !isSending

    /** Convenience projection of the design fields into a domain object. */
    val design: PlanetDesign
        get() =
            PlanetDesign(
                style = planetStyle,
                companions = companions,
                ringColorArgb = ringColorArgb,
                craterColorArgb = craterColorArgb,
                mountainColorArgb = mountainColorArgb,
            )

    companion object {
        /** Default brush colour (a friendly red). */
        const val DEFAULT_COLOR_ARGB: Int = 0xFFE53935.toInt()

        /** Default brush width in canvas pixels. */
        const val DEFAULT_STROKE_WIDTH = 28f
    }
}
