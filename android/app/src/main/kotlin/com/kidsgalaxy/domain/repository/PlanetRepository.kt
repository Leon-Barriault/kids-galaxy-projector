package com.kidsgalaxy.domain.repository

import com.kidsgalaxy.domain.model.Drawing

/**
 * Port: how the domain sends a finished planet somewhere.
 *
 * Declared in the domain and implemented in `data`, so the use case depends on
 * this abstraction rather than on Retrofit. That inversion is what lets the
 * upload rules be tested with a fake.
 */
interface PlanetRepository {
    suspend fun sendPlanet(
        drawing: Drawing,
        name: String,
    ): Result<Unit>
}

/**
 * The server accepted the request but rejected the planet.
 *
 * Declared in the domain rather than in the Retrofit adapter so the
 * presentation layer can react to the status code without importing anything
 * from `data` - keeping dependencies pointing inwards.
 */
class UploadRejectedException(
    val statusCode: Int,
) : Exception("Upload rejected with HTTP $statusCode")
