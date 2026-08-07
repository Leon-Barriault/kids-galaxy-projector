package com.kidsgalaxy.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.Point
import com.kidsgalaxy.domain.model.StrokePath
import com.kidsgalaxy.domain.repository.UploadRejectedException
import com.kidsgalaxy.domain.usecase.SendPlanetResult
import com.kidsgalaxy.domain.usecase.SendPlanetUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Presentation logic for the drawing screen.
 *
 * A plain [ViewModel] that receives a use case, rather than an AndroidViewModel
 * that builds its own HTTP client. That single change is what makes this class
 * unit-testable without an emulator (see DrawingViewModelTest).
 */
class DrawingViewModel(
    private val sendPlanet: SendPlanetUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DrawingUiState())
    val uiState: StateFlow<DrawingUiState> = _uiState.asStateFlow()

    /** Points of the stroke in progress; committed to the Drawing on release. */
    private val currentPoints = mutableListOf<Point>()

    // -------------------- drawing --------------------

    fun changeColor(colorArgb: Int) {
        _uiState.update { it.copy(currentColorArgb = colorArgb) }
    }

    fun changeStrokeWidth(width: Float) {
        _uiState.update { it.copy(currentStrokeWidth = width) }
    }

    /** Records the real drawing-surface size so the texture is undistorted. */
    fun onCanvasSizeChanged(width: Float, height: Float) {
        val size = CanvasSize(width, height)
        if (!size.isMeasured) return
        _uiState.update { it.copy(drawing = it.drawing.withCanvasSize(size)) }
    }

    fun startStroke(point: Point) {
        currentPoints.clear()
        currentPoints.add(point)
    }

    fun continueStroke(point: Point) {
        currentPoints.add(point)
    }

    fun endStroke() {
        if (currentPoints.isEmpty()) return

        val state = _uiState.value
        val stroke =
            StrokePath(
                points = currentPoints.toList(),
                colorArgb = state.currentColorArgb,
                strokeWidth = state.currentStrokeWidth,
            )
        currentPoints.clear()

        // Drawing.addStroke ignores non-renderable strokes (e.g. a single tap).
        _uiState.update { it.copy(drawing = it.drawing.addStroke(stroke)) }
    }

    fun undo() {
        _uiState.update { it.copy(drawing = it.drawing.undo()) }
    }

    fun clear() {
        _uiState.update { it.copy(drawing = it.drawing.clear()) }
    }

    // -------------------- dialogs --------------------

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun dismissSuccess() {
        _uiState.update { it.copy(showSuccess = false) }
    }

    /** Dismiss the celebration and give the child a fresh canvas. */
    fun startNewPlanet() {
        _uiState.update {
            it.copy(showSuccess = false, drawing = it.drawing.clear())
        }
    }

    // -------------------- sending --------------------

    fun sendPlanet(planetName: String) {
        if (_uiState.value.isSending) return // ignore double taps

        _uiState.update { it.copy(isSending = true, errorMessage = null) }
        val drawing = _uiState.value.drawing

        viewModelScope.launch {
            val result = sendPlanet(drawing, planetName)
            _uiState.update { state ->
                when (result) {
                    is SendPlanetResult.Success ->
                        state.copy(isSending = false, showSuccess = true, errorMessage = null)

                    is SendPlanetResult.NothingDrawn ->
                        state.copy(isSending = false, errorMessage = "Draw something first!")

                    is SendPlanetResult.Failed ->
                        state.copy(isSending = false, errorMessage = messageFor(result.cause))
                }
            }
        }
    }

    /** Kid-friendly wording for the failures that can actually happen here. */
    private fun messageFor(cause: Throwable?): String =
        when {
            cause is UploadRejectedException ->
                when (cause.statusCode) {
                    429 -> "Slow down a moment - the galaxy is still catching your last planet!"
                    400 -> "That drawing could not be sent. Try drawing it again!"
                    in 500..599 -> "The galaxy server is having a hiccup. Try again in a moment."
                    else -> "Could not send planet (error ${cause.statusCode})."
                }

            else ->
                "Could not reach the galaxy. Is the tablet connected to the KidsGalaxy Wi-Fi?"
        }
}
