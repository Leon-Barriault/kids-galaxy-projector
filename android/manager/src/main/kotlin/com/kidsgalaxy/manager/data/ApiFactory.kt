package com.kidsgalaxy.manager.data

import android.content.Context
import com.kidsgalaxy.connection.MutualTls
import com.kidsgalaxy.manager.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/** HTTP client for whichever galaxy the volunteer selected. */
object ApiFactory {
    private const val MANAGER_CERT_ASSET = "manager.p12"

    fun httpClient(
        context: Context,
        useMutualTls: Boolean = BuildConfig.USE_MTLS,
    ): OkHttpClient {
        val builder =
            OkHttpClient
                .Builder()
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)

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
                clientCertificateAsset = MANAGER_CERT_ASSET,
                password = BuildConfig.CLIENT_CERT_PASSWORD.toCharArray(),
            )
        }

        return builder.build()
    }

    fun create(
        context: Context,
        baseUrl: String = BuildConfig.SERVER_BASE_URL,
        useMutualTls: Boolean = BuildConfig.USE_MTLS,
    ): ManagerApi =
        Retrofit
            .Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/")
            .client(httpClient(context, useMutualTls))
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ManagerApi::class.java)
}
