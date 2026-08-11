package com.kidsgalaxy.manager.data

import android.content.Context

class PlanetExportHttpException(
    val statusCode: Int,
    exportName: String,
) : IllegalStateException("$exportName export failed (HTTP $statusCode)")

class PlanetExportPayloadException(
    val exportName: String,
    detail: String,
) : IllegalStateException("$exportName export returned invalid data: $detail")

class PlanetExportClient(
    context: Context,
    baseUrl: String,
) {
    companion object {
        // Rendering a print sheet or a watertight STL is intentionally more CPU
        // intensive than the manager's normal JSON API calls, especially on a Pi.
        private const val EXPORT_READ_TIMEOUT_SECONDS = 60L
        private val PNG_SIGNATURE =
            byteArrayOf(
                0x89.toByte(),
                0x50,
                0x4E,
                0x47,
                0x0D,
                0x0A,
                0x1A,
                0x0A,
            )
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
        val bytes =
            requireNotNull(response.body()) { "Galaxy server returned an empty print export" }
                .bytes()
        if (!bytes.hasPrefix(PNG_SIGNATURE)) {
            throw PlanetExportPayloadException("Print", "PNG signature is missing")
        }
        return bytes
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

private fun ByteArray.hasPrefix(prefix: ByteArray): Boolean =
    size >= prefix.size && prefix.indices.all { index -> this[index] == prefix[index] }
