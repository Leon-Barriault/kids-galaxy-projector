package com.kidsgalaxy.domain.usecase

import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.repository.PlanetRepository

const val DEFAULT_PLANET_NAME = "My Planet"

/** Outcome of a send attempt, so the UI never has to interpret exceptions. */
sealed interface SendPlanetResult {
    data object Success : SendPlanetResult

    /** The child pressed launch without drawing anything. */
    data object NothingDrawn : SendPlanetResult

    data class Failed(val cause: Throwable?) : SendPlanetResult
}

/**
 * Sends the current drawing to the galaxy server.
 *
 * Owns two rules that must not live in the UI: an empty drawing is never sent,
 * and a blank name becomes a friendly default. Both are covered by unit tests.
 */
class SendPlanetUseCase(private val repository: PlanetRepository) {

    suspend operator fun invoke(drawing: Drawing, name: String): SendPlanetResult {
        if (drawing.isEmpty) return SendPlanetResult.NothingDrawn

        val displayName = name.trim().ifBlank { DEFAULT_PLANET_NAME }

        return repository.sendPlanet(drawing, displayName).fold(
            onSuccess = { SendPlanetResult.Success },
            onFailure = { SendPlanetResult.Failed(it) },
        )
    }
}
