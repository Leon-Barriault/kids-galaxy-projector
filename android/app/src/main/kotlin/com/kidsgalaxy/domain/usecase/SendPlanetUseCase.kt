package com.kidsgalaxy.domain.usecase

import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetDesign
import com.kidsgalaxy.domain.repository.PlanetRepository

/** Fallback name used when the child leaves the name field blank. */
const val DEFAULT_PLANET_NAME = "My Planet"

/**
 * Result of attempting to send a planet to the galaxy server.
 *
 * Using a sealed interface keeps the possible outcomes exhaustive at the
 * call site (ViewModel) and avoids leaking repository exceptions upward.
 */
sealed interface SendPlanetResult {
    /** The planet was accepted and is now live (or at least stored). */
    data object Success : SendPlanetResult

    /** The drawing contained no renderable strokes; nothing was sent. */
    data object NothingDrawn : SendPlanetResult

    /**
     * The send failed for a network, validation, or server reason.
     *
     * @property cause The underlying throwable when available (useful for
     *                 logging / mapping to user-facing messages).
     */
    data class Failed(
        val cause: Throwable?,
    ) : SendPlanetResult
}

/**
 * Application use case that sends the child's current drawing to the galaxy.
 *
 * Responsibilities:
 * - Reject empty drawings early (no network call).
 * - Normalise the display name (trim + fallback).
 * - Delegate the actual transport + texture rendering to the [PlanetRepository].
 * - Translate the repository Result into a domain-friendly [SendPlanetResult].
 *
 * The use case itself is framework-free and can be unit-tested with a fake
 * repository.
 */
class SendPlanetUseCase(
    private val repository: PlanetRepository,
) {
    /**
     * Attempt to send the given drawing under the given name and design.
     *
     * @param drawing The strokes the child has drawn (must not be empty).
     * @param name    Free-text name typed by the child (may be blank).
     * @param design  Optional style / companions / ring colour choices.
     * @return A [SendPlanetResult] describing success, empty drawing, or failure.
     */
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
