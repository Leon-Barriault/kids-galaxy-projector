package com.kidsgalaxy.data.remote

import android.content.Context
import android.util.Log
import com.kidsgalaxy.BuildConfig
import com.kidsgalaxy.connection.MutualTls
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/** Builds the drawing tablet API client for the selected galaxy. */
object ApiClient {
    private const val TAG = "KidsGalaxyApi"
    private const val CLIENT_CERT_ASSET = "client.p12"

    fun create(
        context: Context,
        baseUrl: String = BuildConfig.SERVER_BASE_URL,
        useMutualTls: Boolean = BuildConfig.USE_MTLS,
    ): PlanetApi {
        val builder =
            OkHttpClient
                .Builder()
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .writeTimeout(20, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)

        if (BuildConfig.DEBUG) {
            builder.addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                },
            )
        }

        if (useMutualTls) {
            MutualTls.apply(
                context = context.applicationContext,
                builder = builder,
                clientCertificateAsset = CLIENT_CERT_ASSET,
                password = BuildConfig.CLIENT_CERT_PASSWORD.toCharArray(),
            )
            Log.i(TAG, "mTLS enabled - presenting kid tablet certificate")
        }

        return Retrofit
            .Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/")
            .client(builder.build())
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(PlanetApi::class.java)
    }
}
