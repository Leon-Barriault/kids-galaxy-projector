package com.kidsgalaxy.connection

import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Result of probing a candidate galaxy's public identity endpoint. */
data class GalaxyVerification(
    val reachable: Boolean,
    val message: String? = null,
)

/**
 * Confirms that a target is reachable and really is a Kids Galaxy server.
 *
 * The caller supplies its existing OkHttpClient so verification uses exactly
 * the same trust store and client certificate as the real tablet traffic.
 * `verify` is blocking and must be called away from the Android main thread.
 */
class GalaxyTargetVerifier(
    client: OkHttpClient,
) {
    private val probeClient =
        client
            .newBuilder()
            .callTimeout(PROBE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()

    fun verify(target: GalaxyTarget): GalaxyVerification {
        val request =
            Request
                .Builder()
                .url(target.baseUrl + IDENTITY_PATH)
                .get()
                .build()

        return try {
            probeClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return GalaxyVerification(
                        reachable = false,
                        message = "Galaxy answered with HTTP ${response.code}",
                    )
                }

                val payload = response.peekBody(MAX_IDENTITY_BYTES).string()
                if (!hasGalaxyMarker(payload)) {
                    return GalaxyVerification(
                        reachable = false,
                        message = "That address is not a Kids Galaxy projector",
                    )
                }

                GalaxyVerification(reachable = true)
            }
        } catch (_error: IOException) {
            GalaxyVerification(
                reachable = false,
                message = "Galaxy could not be reached",
            )
        } catch (_error: IllegalArgumentException) {
            GalaxyVerification(
                reachable = false,
                message = "Galaxy address is invalid",
            )
        }
    }

    companion object {
        private const val IDENTITY_PATH = "api/galaxy"
        private const val SERVICE_MARKER = "kids-galaxy-projector"
        private const val MAX_IDENTITY_BYTES = 4096L
        private const val PROBE_TIMEOUT_SECONDS = 5L

        internal fun hasGalaxyMarker(payload: String): Boolean {
            val compact = payload.filterNot(Char::isWhitespace)
            return compact.contains("\"service\":\"$SERVICE_MARKER\"")
        }
    }
}
