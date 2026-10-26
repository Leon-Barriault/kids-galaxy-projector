package com.kidsgalaxy.connection

import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Why a galaxy probe did not succeed. The UI maps these to localized copy. */
enum class ProbeProblem {
    HTTP_STATUS,
    NOT_A_GALAXY,
    UNREACHABLE,
    INVALID_ADDRESS,
}

/** Result of probing a candidate galaxy's public identity endpoint. */
data class GalaxyVerification(
    val reachable: Boolean,
    val problem: ProbeProblem? = null,
    val statusCode: Int? = null,
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
                        problem = ProbeProblem.HTTP_STATUS,
                        statusCode = response.code,
                    )
                }

                val payload = response.peekBody(MAX_IDENTITY_BYTES).string()
                if (!hasGalaxyMarker(payload)) {
                    return GalaxyVerification(
                        reachable = false,
                        problem = ProbeProblem.NOT_A_GALAXY,
                    )
                }

                GalaxyVerification(reachable = true)
            }
        } catch (_error: IOException) {
            GalaxyVerification(
                reachable = false,
                problem = ProbeProblem.UNREACHABLE,
            )
        } catch (_error: IllegalArgumentException) {
            GalaxyVerification(
                reachable = false,
                problem = ProbeProblem.INVALID_ADDRESS,
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
