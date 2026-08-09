package com.kidsgalaxy.domain.repository

import com.kidsgalaxy.domain.model.Drawing
import com.kidsgalaxy.domain.model.PlanetDesign

/**
 * Port: how the domain sends a finished planet somewhere.
 *
 * The two-argument method remains the compatibility seam for simple fakes.
 * Production adapters override the design-aware method as well.
 */
interface PlanetRepository {
    suspend fun sendPlanet(
        drawing: Drawing,
        name: String,
    ): Result<Unit>

    suspend fun sendPlanet(
        drawing: Drawing,
        name: String,
        design: PlanetDesign,
    ): Result<Unit> = sendPlanet(drawing, name)
}

/** The server accepted the request but rejected the planet. */
class UploadRejectedException(
    val statusCode: Int,
) : Exception("Upload rejected with HTTP $statusCode")
