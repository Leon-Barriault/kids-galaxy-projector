package com.kidsgalaxy.manager.data

import android.content.Context
import kotlinx.coroutines.delay

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
        private const val EXPORT_READ_TIMEOUT_SECONDS = 60L
        private const val WEBGL_NOT_READY_STATUS = 409
        private const val WEBGL_READY_ATTEMPTS = 40
        private const val WEBGL_READY_RETRY_MS = 250L
        private val PDF_SIGNATURE = "%PDF".encodeToByteArray()
    }

    private val api =
        ApiFactory.create(
            context.applicationContext,
            baseUrl,
            readTimeoutSeconds = EXPORT_READ_TIMEOUT_SECONDS,
        )

    suspend fun printPdf(planetId: String): ByteArray {
        var response = api.printPdf(planetId)
        var attempt = 1
        while (
            response.code() == WEBGL_NOT_READY_STATUS &&
            attempt < WEBGL_READY_ATTEMPTS
        ) {
            response.errorBody()?.close()
            delay(WEBGL_READY_RETRY_MS)
            attempt += 1
            response = api.printPdf(planetId)
        }

        if (!response.isSuccessful) {
            throw PlanetExportHttpException(response.code(), "Print")
        }
        val bytes =
            requireNotNull(response.body()) { "Galaxy server returned an empty print export" }
                .bytes()
        if (!bytes.hasPrefix(PDF_SIGNATURE)) {
            throw PlanetExportPayloadException("Print", "PDF signature is missing")
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
