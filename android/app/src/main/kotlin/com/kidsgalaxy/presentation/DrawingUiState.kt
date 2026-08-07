package com.kidsgalaxy.presentation

import com.kidsgalaxy.domain.model.Drawing

/**
 * Everything the drawing screen needs to render.
 *
 * Colour is kept as an ARGB Int (not a Compose Color) so this state - and the
 * ViewModel that owns it - remains testable on the JVM.
 */
data class DrawingUiState(
    val drawing: Drawing = Drawing(),
    val currentColorArgb: Int = DEFAULT_COLOR_ARGB,
    val currentStrokeWidth: Float = DEFAULT_STROKE_WIDTH,
    val isSending: Boolean = false,
    val errorMessage: String? = null,
    val showSuccess: Boolean = false,
) {
    val canUndo: Boolean get() = !drawing.isEmpty
    val canLaunch: Boolean get() = !drawing.isEmpty && !isSending

    companion object {
        const val DEFAULT_COLOR_ARGB: Int = 0xFFE53935.toInt() // bright red
        const val DEFAULT_STROKE_WIDTH = 28f // kid-friendly thick brush
    }
}
