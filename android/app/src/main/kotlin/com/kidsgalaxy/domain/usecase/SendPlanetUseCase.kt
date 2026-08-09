package com.kidsgalaxy.domain.usecase

import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetDesign
import com.kidsgalaxy.domain.repository.PlanetRepository

const val DEFAULT_PLANET_NAME = "My Planet"

sealed interface SendPlanetResult {
    data object Success : SendPlanetResult
    data object NothingDrawn : SendPlanetResult
    data class Failed(val cause: Throwable?) : SendPlanetResult
}

/** Sends the current drawing and the child's preselected planet design. */
class SendPlanetUseCase(
    private val repository: PlanetRepository,
) {
    suspend operator fun invoke(
        drawing: Drawing,
        name: String,
        design: PlanetDesign = PlanetDesign(),
    ): SendPlanetResult {
        if (drawing.isEmpty) return SendPlanetResult.NothingDrawn

        val displayName = name.trim().ifBlank { DEFAULT_PLANET_NAME }

        return repository.sendPlanet(drawing, displayName, design).fold(
            onSuccess = { SendPlanetResult.Success },
            onFailure = { SendPlanetResult.Failed(it) },
        )
    }
}
