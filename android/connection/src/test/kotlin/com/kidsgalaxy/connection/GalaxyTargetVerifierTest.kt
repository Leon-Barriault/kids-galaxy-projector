package com.kidsgalaxy.connection

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class GalaxyTargetVerifierTest {
    @Test
    fun `accepts reachable Kids Galaxy identity`() {
        val verifier = verifierReturning(200, """{"service":"kids-galaxy-projector","name":"Room A"}""")

        val result = verifier.verify(target())

        assertTrue(result.reachable)
        assertEquals(null, result.message)
    }

    @Test
    fun `rejects another service even when HTTP succeeds`() {
        val verifier = verifierReturning(200, """{"service":"printer","name":"Room A"}""")

        val result = verifier.verify(target())

        assertFalse(result.reachable)
        assertEquals("That address is not a Kids Galaxy projector", result.message)
    }

    @Test
    fun `rejects unsuccessful HTTP response`() {
        val verifier = verifierReturning(503, "temporarily unavailable")

        val result = verifier.verify(target())

        assertFalse(result.reachable)
        assertEquals("Galaxy answered with HTTP 503", result.message)
    }

    @Test
    fun `reports network failure without leaking transport details`() {
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor { throw IOException("certificate or route failure") }
                .build()

        val result = GalaxyTargetVerifier(client).verify(target())

        assertFalse(result.reachable)
        assertEquals("Galaxy could not be reached", result.message)
    }

    @Test
    fun `probes the public galaxy identity endpoint`() {
        var requestedPath = ""
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(
                    Interceptor { chain ->
                        requestedPath = chain.request().url.encodedPath
                        response(chain, 200, """{"service":"kids-galaxy-projector"}""")
                    },
                ).build()

        GalaxyTargetVerifier(client).verify(target())

        assertEquals("/api/galaxy", requestedPath)
    }

    private fun verifierReturning(
        code: Int,
        body: String,
    ): GalaxyTargetVerifier =
        GalaxyTargetVerifier(
            OkHttpClient
                .Builder()
                .addInterceptor { chain -> response(chain, code, body) }
                .build(),
        )

    private fun response(
        chain: Interceptor.Chain,
        code: Int,
        body: String,
    ): Response =
        Response
            .Builder()
            .request(chain.request())
            .protocol(Protocol.HTTP_1_1)
            .code(code)
            .message("test")
            .body(body.toResponseBody("application/json".toMediaType()))
            .build()

    private fun target(): GalaxyTarget = GalaxyTarget.create("Room A", "http://10.42.0.1:8000/")
}
