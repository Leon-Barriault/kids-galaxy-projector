package com.kidsgalaxy.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kidsgalaxy.domain.model.CanvasSize
import com.kidsgalaxy.domain.model.PlanetCompanion
import com.kidsgalaxy.domain.model.PlanetStyle
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

/** Presentation logic for the kid planet creation flow. */
class DrawingViewModel(
    private val sendPlanet: SendPlanetUseCase,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DrawingUiState())
    val uiState: StateFlow<DrawingUiState> = _uiState.asStateFlow()

    private val currentPoints = mutableListOf<Point>()

    fun choosePlanetStyle(style: PlanetStyle) {
        _uiState.update { it.copy(planetStyle = style) }
    }

    fun changeRingColor(colorArgb: Int) {
        _uiState.update { it.copy(ringColorArgb = colorArgb) }
    }

    fun toggleCompanion(companion: PlanetCompanion) {
        _uiState.update { state ->
            val next =
                if (companion in state.companions) {
                    state.companions - companion
                } else {
                    state.companions + companion
                }
            state.copy(companions = next)
        }
    }

    fun changeColor(colorArgb: Int) {
        _uiState.update { it.copy(currentColorArgb = colorArgb) }
    }

    fun changeStrokeWidth(width: Float) {
        _uiState.update { it.copy(currentStrokeWidth = width) }
    }

    fun onCanvasSizeChanged(
        width: Float,
        height: Float,
    ) {
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
        _uiState.update { it.copy(drawing = it.drawing.addStroke(stroke)) }
    }

    fun undo() {
        _uiState.update { it.copy(drawing = it.drawing.undo()) }
    }

    fun clear() {
        _uiState.update { it.copy(drawing = it.drawing.clear()) }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun dismissSuccess() {
        _uiState.update { it.copy(showSuccess = false) }
    }

    fun startNewPlanet() {
        _uiState.update {
            DrawingUiState(
                drawing = it.drawing.clear(),
                currentColorArgb = it.currentColorArgb,
                currentStrokeWidth = it.currentStrokeWidth,
            )
        }
    }

    fun sendPlanet(planetName: String) {
        if (_uiState.value.isSending) return

        _uiState.update { it.copy(isSending = true, errorMessage = null) }
        val stateAtLaunch = _uiState.value

        viewModelScope.launch {
            val result = sendPlanet(stateAtLaunch.drawing, planetName, stateAtLaunch.design)
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

    private fun messageFor(cause: Throwable?): String =
        when {
            cause is UploadRejectedException ->
                when (cause.statusCode) {
                    429 -> "Slow down a moment - the galaxy is still catching your last planet!"
                    400 -> "That planet could not be sent. Check its style and try again!"
                    in 500..599 -> "The galaxy server is having a hiccup. Try again in a moment."
                    else -> "Could not send planet (error ${cause.statusCode})."
                }

            else ->
                "Could not reach the galaxy. Is the tablet connected to the KidsGalaxy Wi-Fi?"
        }
}
