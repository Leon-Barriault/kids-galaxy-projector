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
        private const val EXPORT_READ_TIMEOUT_SECONDS = 60L
        private val PDF_SIGNATURE = "%PDF".encodeToByteArray()
    }

    private val api =
        ApiFactory.create(
            context.applicationContext,
            baseUrl,
            readTimeoutSeconds = EXPORT_READ_TIMEOUT_SECONDS,
        )

    /**
     * The galaxy server always has a sheet to give us now, so this asks once.
     *
     * It used to poll for a 409 to clear - forty attempts, 250 ms apart. When
     * the projector browser was not going to publish a render for this planet
     * (nobody has the projector open, or it is past the twelfth planet the
     * projector holds while we list thirty) the 409 never cleared, so tapping
     * Print froze the app for ten seconds and then showed "HTTP 409". Waiting
     * longer was never going to help; the server now answers with its own
     * render instead, and says which one it sent in X-Kids-Galaxy-Render-Source.
     */
    suspend fun printPdf(planetId: String): ByteArray {
        val response = api.printPdf(planetId)

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
