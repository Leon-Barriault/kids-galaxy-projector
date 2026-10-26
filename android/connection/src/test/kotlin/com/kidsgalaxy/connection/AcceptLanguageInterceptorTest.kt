package com.kidsgalaxy.connection

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test

class AcceptLanguageInterceptorTest {
    @Test
    fun `requests carry the active tablet language`() {
        var seen = ""
        val client =
            OkHttpClient
                .Builder()
                .addInterceptor(AcceptLanguageInterceptor { UiLanguage.FRENCH })
                .addInterceptor(
                    Interceptor { chain ->
                        seen = chain.request().header("Accept-Language").orEmpty()
                        response(chain)
                    },
                ).build()

        client
            .newCall(Request.Builder().url("http://10.42.0.1:8000/api/upload").build())
            .execute()
            .close()

        assertEquals("fr-CA,fr;q=0.9", seen)
    }

    private fun response(chain: Interceptor.Chain): Response =
        Response
            .Builder()
            .request(chain.request())
            .protocol(Protocol.HTTP_1_1)
            .code(200)
            .message("ok")
            .body("ok".toResponseBody("text/plain".toMediaType()))
            .build()
}
