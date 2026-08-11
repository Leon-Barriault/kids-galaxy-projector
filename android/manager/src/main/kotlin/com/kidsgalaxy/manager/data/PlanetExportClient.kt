package com.kidsgalaxy.manager.data

import android.content.Context

class PlanetExportHttpException(
    val statusCode: Int,
    exportName: String,
) : IllegalStateException("$exportName export failed (HTTP $statusCode)")

class PlanetExportClient(
    context: Context,
    baseUrl: String,
) {
    companion object {
        // Rendering a print sheet or a watertight STL is intentionally more CPU
        // intensive than the manager's normal JSON API calls, especially on a Pi.
        private const val EXPORT_READ_TIMEOUT_SECONDS = 60L
    }

    private val api =
        ApiFactory.create(
            context.applicationContext,
            baseUrl,
            readTimeoutSeconds = EXPORT_READ_TIMEOUT_SECONDS,
        )

    suspend fun printSheet(planetId: String): ByteArray {
        val response = api.printSheet(planetId)
        if (!response.isSuccessful) {
            throw PlanetExportHttpException(response.code(), "Print")
        }
        return requireNotNull(response.body()) { "Galaxy server returned an empty print export" }.bytes()
    }

    suspend fun stl(
        planetId: String,
        diameterMm: Double = 80.0,
    ): ByteArray {
        val response = api.exportStl(planetId, diameterMm)
        if (!response.isSuccessful) {
            throw PlanetExportHttpException(response.code(), "STL")
        }
        return requireNotNull(response.body()) { "Galaxy server returned an empty STL export" }.bytes()
    }
}
