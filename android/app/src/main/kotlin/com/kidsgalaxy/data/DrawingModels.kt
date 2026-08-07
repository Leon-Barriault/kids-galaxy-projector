package com.kidsgalaxy.data

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color

data class StrokePath(
    val points: List<Offset>,
    val color: Color,
    val strokeWidth: Float,
)

data class DrawingUiState(
    val strokes: List<StrokePath> = emptyList(),
    val currentColor: Color = Color(0xFFE53935), // bright red default
    val currentStrokeWidth: Float = 28f, // kid-friendly thick brush
    val isSending: Boolean = false,
    val lastError: String? = null,
    val showSuccess: Boolean = false,
)
