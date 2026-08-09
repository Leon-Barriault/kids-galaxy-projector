package com.kidsgalaxy.presentation

import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetCompanion
import com.kidsgalaxy.domain.model.PlanetDesign
import com.kidsgalaxy.domain.model.PlanetStyle

/** Everything the kid creation flow needs to render. */
data class DrawingUiState(
    val drawing: Drawing = Drawing(),
    val planetStyle: PlanetStyle = PlanetStyle.CLASSIC,
    val companions: Set<PlanetCompanion> = emptySet(),
    val currentColorArgb: Int = DEFAULT_COLOR_ARGB,
    val currentStrokeWidth: Float = DEFAULT_STROKE_WIDTH,
    val isSending: Boolean = false,
    val errorMessage: String? = null,
    val showSuccess: Boolean = false,
) {
    val canUndo: Boolean get() = !drawing.isEmpty
    val canLaunch: Boolean get() = !drawing.isEmpty && !isSending
    val design: PlanetDesign get() = PlanetDesign(planetStyle, companions)

    companion object {
        const val DEFAULT_COLOR_ARGB: Int = 0xFFE53935.toInt()
        const val DEFAULT_STROKE_WIDTH = 28f
    }
}
